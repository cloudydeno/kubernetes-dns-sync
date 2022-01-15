import { ttlFromAnnotations } from "../../common/annotations.ts";
import {
  GoogleProviderConfig,
  DnsProvider,
  Zone, BaseRecord, getPlainRecordKey, SourceRecord, ZoneState, PlainRecord,
} from "../../common/mod.ts";
import { transformFromRrdata, transformToRrdata } from "../../common/rrdata.ts";
import { GoogleCloudDnsApi,
  Schema$Change,
  Schema$ResourceRecordSet,
} from "./api.ts";

interface GoogleRecord extends BaseRecord {
  recordSet?: Schema$ResourceRecordSet;
}

const supportedRecords = {
  'A': true,
  'AAAA': true,
  'NS': true,
  'CNAME': true,
  'TXT': true,
  'MX': true,
};

export class GoogleProvider implements DnsProvider<GoogleRecord> {
  constructor(
    public config: GoogleProviderConfig,
  ) {
    this.projectId = this.config.project_id ?? this.api.projectId;
  }
  private projectId: string;
  private api = new GoogleCloudDnsApi(
    Deno.args.includes('--dry-run') ? 'readonly' : 'readwrite',
    Deno.args.includes('--once'), // deno can't unref timers yet
  );

  async ListZones(): Promise<Array<Zone>> {
    const zones = new Array<Zone>();
    const zoneFilter = new Set(this.config.zone_filter ?? []);
    const domainFilter = new Set(this.config.domain_filter ?? []);
    for await (const zone of this.api.listAllZones(this.projectId)) {
      if (zoneFilter.size > 0 && !zoneFilter.has(zone.name!)) continue;
      if (domainFilter.size > 0 && !domainFilter.has(zone.dnsName!)) continue;
      zones.push({DNSName: zone.dnsName!.replace(/\.$/, ''), ZoneName: zone.name!, ZoneID: zone.id!});
    }
    return zones;
  }

  ComparisionKey(record: GoogleRecord): string {
    // google has no extra config stored with DNS records
    return JSON.stringify(getPlainRecordKey(record.dns));
  }
  GroupingKey(record: GoogleRecord): string {
    // This 'should' line up with how Google recordsets are
    return JSON.stringify([record.dns.fqdn, record.dns.type]);
  }

  EnrichSourceRecord(record: SourceRecord): GoogleRecord | null {
    if (!(record.dns.type in supportedRecords)) {
      console.error(`TODO: unsupported record type ${record.dns.type} desired for Google zone at ${record.dns.fqdn}`);
      return null; // toss unsupported records
    }
    return {
      ...record,
      dns: {
        ...record.dns,
        ttl: record.dns.ttl ?? ttlFromAnnotations(record.annotations) ?? 300
      },
    };
  }

  async ListRecords(zone: Zone): Promise<GoogleRecord[]> {
    const endpoints = new Array<GoogleRecord>(); // every recordset we find
    for await (const record of this.api.listAllRecords(this.projectId, zone.ZoneID)) {
      const dnsName = record.name!.replace(/\.$/, '');

      for (const rrdata of record.rrdatas ?? []) {
        endpoints.push({
          recordSet: record,
          dns: {
            fqdn: dnsName,
            ttl: record.ttl,
            ...transformFromRrdata(record.type as any, rrdata),
          }
        });
      }
    }
    return endpoints;
  }

  async ApplyChanges(state: ZoneState<GoogleRecord>): Promise<void> {
    const zone = state.Zone;

    const change = {
      kind: "dns#change" as const,
      additions: new Array<Schema$ResourceRecordSet>(),
      deletions: new Array<Schema$ResourceRecordSet>(),
    };

    for (const diff of state.Diff ?? []) {
      // If there's anything we want to change, we have to do a full replacement
      // Making only a creation or only a deletion is only for new or removed rrsets

      if (diff.existing.length) {
        change.deletions.push(diff.toDelete[0].recordSet!);
      }

      if (diff.desired.length) {
        const {fqdn, type} = diff.desired[0].dns;
        const ttls = diff.desired.map(x => x.dns.ttl).flatMap(x => x ? [x] : []);
        change.additions.push({
          kind: 'dns#resourceRecordSet',
          name: `${fqdn}.`,
          type,
          ttl: ttls.length ? Math.min(...ttls) : 300,
          rrdatas: diff.desired.map(x => transformToRrdata(x.dns)),
        });
      }
    }

    // Actually submit the changes
    if (change.additions!.length < 1 && change.deletions!.length < 1) return;

    console.log('-->', 'Cloud DNS zone', zone.ZoneName,
      '-', change.deletions!.length, 'deletions',
      '-', change.additions!.length, 'additions');

    let submitted: Schema$Change = await this.api
      .submitChange(this.projectId, zone.ZoneID, change);

    console.log('==>', 'Cloud DNS change', submitted.id,
      'on', zone.ZoneName,
      'at', submitted.startTime,
      'is', submitted.status);

    let sleepSecs = 0;
    while (submitted.status === 'pending') {
      if ((sleepSecs += 1) >= 30) throw new Error(
        `Google Cloud DNS changeset has been pending for a long-ass time!`);
      await new Promise(ok => setTimeout(ok, sleepSecs * 1000));

      submitted = await this.api
        .getChange(this.projectId, zone.ZoneID, submitted.id!);

      console.log('   ', 'Cloud DNS change', submitted.id,
        'is', submitted.status);
    }

  }

}
