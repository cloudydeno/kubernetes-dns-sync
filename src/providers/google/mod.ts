import { ttlFromAnnotations } from "../../common/annotations.ts";
import {
  GoogleProviderConfig,
  DnsProvider,
  Zone, Endpoint, Changes, BaseRecord, getPlainRecordKey, SourceRecord, ZoneDiff,
} from "../../common/mod.ts";
import { GoogleCloudDnsApi,
  Schema$Change,
  Schema$ResourceRecordSet,
} from "./api.ts";
import { readTxtValue } from "./util.ts";

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

  // recordSetMap = new Map<string,Schema$ResourceRecordSet>();

  // findZoneForName(dnsName: string): Zone | undefined {
  //   const matches = this.Zones.filter(x => x.DNSName == dnsName || dnsName.endsWith('.'+x.DNSName));
  //   return matches.sort((a,b) => b.DNSName.length - a.DNSName.length)[0];
  // }

  ComparisionKey(record: GoogleRecord): string {
    // google has no extra config stored with DNS records
    return JSON.stringify(getPlainRecordKey(record.dns));
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
        const type = record.type as keyof typeof supportedRecords;
        switch (type) {
          case 'A':
          case 'AAAA':
          case 'CNAME':
          case 'NS':
          // case 'PTR':
            endpoints.push({
              recordSet: record,
              dns: {
                fqdn: dnsName,
                type: type,
                ttl: record.ttl,
                target: rrdata.replace(/\.$/, ''),
              }});
            break;
          case 'TXT':
            endpoints.push({
              recordSet: record,
              dns: {
                fqdn: dnsName,
                type: type,
                ttl: record.ttl,
                content: readTxtValue(rrdata),
              }});
            break;
          case 'MX': {
            const [priority, target] = rrdata.split(' ');
            endpoints.push({
              recordSet: record,
              dns: {
                fqdn: dnsName,
                type: type,
                ttl: record.ttl,
                priority: parseInt(priority, 10),
                target: target.replace(/\.$/, ''),
              }});
          }; break;
          // for the future: https://cloud.google.com/dns/docs/reference/json-record
          default:
            console.error(`TODO: unsupported record type ${type} observed in Google zone at ${record.name}`);
            const _: never = type;
        }
      }
    }
    return endpoints;
  }

  async ApplyChanges(diff: ZoneDiff<GoogleRecord>): Promise<void> {
    const zone = diff.state.Zone;

    const change: Schema$Change = {
      kind: "dns#change",
      additions: [],
      deletions: Array.from(new Set(diff
        .toDelete.map(x => x.recordSet)
        .flatMap(x => x ? [x] : []))),
    };

    const neededSets = new Set([
      ...diff.toCreate,
      ...diff.toDelete,
    ].map(x => JSON.stringify([x.dns.fqdn, x.dns.type])));

    for (const neededSet of neededSets) {
      const [fqdn, type] = JSON.parse(neededSet) as [string, keyof typeof supportedRecords];
      const desired = diff.state.Desired?.filter(x => x.dns.fqdn == fqdn && x.dns.type == type);
      if (!desired?.length) continue;

      const kind = 'dns#resourceRecordSet';
      const name = `${fqdn}.`;
      const ttls = desired.map(x => x.dns.ttl).flatMap(x => x ? [x] : []);
      const ttl = ttls.length ? Math.min(...ttls) : 300;

      switch (type) {
        case 'A':
        case 'AAAA':
        {
          const typedDesired = desired as Array<BaseRecord&{dns: {type: typeof type}}>;
          change.additions!.push({
            kind, name, type, ttl,
            rrdatas: typedDesired.map(x => x.dns.target),
          });
        }; break;
        case 'CNAME':
        case 'NS':
        {
          const typedDesired = desired as Array<BaseRecord&{dns: {type: typeof type}}>;
          change.additions!.push({
            kind, name, type, ttl,
            rrdatas: typedDesired.map(x => `${x.dns.target}.`),
          });
        }; break;
        case 'MX':
        {
          const typedDesired = desired as Array<BaseRecord&{dns: {type: typeof type}}>;
          change.additions!.push({
            kind, name, type, ttl,
            rrdatas: typedDesired.map(x => `${x.dns.priority} ${x.dns.target}.`),
          });
        }; break;
        case 'TXT':
        {
          const typedDesired = desired as Array<BaseRecord&{dns: {type: typeof type}}>;
          change.additions!.push({
            kind, name, type, ttl,
            rrdatas: typedDesired.map(x => (x.dns.content
              .match(/.{1,220}/g) ?? [])
              .map(x => `"${x.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`)
              .join(' ')),
          });
        }; break;
        // for the future: https://cloud.google.com/dns/docs/reference/json-record
        default:
          console.error(`TODO: unsupported record type ${type} desired in Google zone at ${fqdn}`);
          const _: never = type;
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
