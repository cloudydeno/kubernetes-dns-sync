import {
  GoogleProviderConfig,
  DnsProvider, DnsProviderContext,
  Zone, Endpoint, Changes,
  SplitOutTarget,
} from "../../common/mod.ts";
import { GoogleCloudDnsApi,
  Schema$Change,
  Schema$ResourceRecordSet,
} from "./api.ts";

export class GoogleProvider implements DnsProvider<GoogleProviderContext> {
  constructor(
    public config: GoogleProviderConfig,
  ) {}
  private api = new GoogleCloudDnsApi(
    Deno.args.includes('--dry-run') ? 'readonly' : 'readwrite',
    Deno.args.includes('--once'), // deno can't unref timers yet
  );
  private projectId = this.config.project_id ?? this.api.projectId;

  async NewContext(): Promise<GoogleProviderContext> {
    const zones = new Array<Zone>();
    const zoneFilter = new Set(this.config.zone_filter ?? []);
    const domainFilter = new Set(this.config.domain_filter ?? []);
    for await (const zone of this.api.listAllZones(this.projectId)) {
      if (zoneFilter.size > 0 && !zoneFilter.has(zone.name!)) continue;
      if (domainFilter.size > 0 && !domainFilter.has(zone.dnsName!)) continue;
      zones.push({DNSName: zone.dnsName!.slice(0, -1), ZoneName: zone.name!, ZoneID: zone.id!});
    }
    return new GoogleProviderContext(this.config, this.projectId, zones, this.api);
  }
}

export class GoogleProviderContext implements DnsProviderContext {

  constructor(
    public config: GoogleProviderConfig,
    public projectId: string,
    public Zones: Array<Zone>,
    private api: GoogleCloudDnsApi,
  ) {}
  recordSetMap = new Map<string,Schema$ResourceRecordSet>();

  findZoneForName(dnsName: string): Zone | undefined {
    const matches = this.Zones.filter(x => x.DNSName == dnsName || dnsName.endsWith('.'+x.DNSName));
    return matches.sort((a,b) => b.DNSName.length - a.DNSName.length)[0];
  }

  async Records(): Promise<Endpoint[]> {
    const endpoints = new Array<Endpoint>(); // every recordset we find
    for (const zone of this.Zones) {

      for await (const record of this.api.listAllRecords(this.projectId, zone.ZoneID)) {
        const dnsName = record.name!.slice(0, -1);
        this.recordSetMap.set(`${dnsName}:${record.type}`, record);


        endpoints.push({
          DNSName: dnsName,
          RecordType: record.type!,
          Targets: decodeTargets(record.type!, record.rrdatas!),
          RecordTTL: record.ttl ?? undefined,
          Priority: undefined,
          SplitOutTarget,
        });

      }
    }
    return endpoints;
  }

  async ApplyChanges(changes: Changes): Promise<void> {

    const byZone = new Map<Zone,Schema$Change>();
    for (const zone of this.Zones) {
      byZone.set(zone, {
        kind: "dns#change",
        additions: [],
        deletions: [],
      });
    }

    // TODO: priority breaks all of this; need to flatten stuff

    for (const deleted of changes.Delete) {
      const zone = this.findZoneForName(deleted.DNSName);
      if (!zone) continue;
      const changes = byZone.get(zone)!;

      const rrsetKey = `${deleted.DNSName}:${deleted.RecordType}`;
      const rrset = this.recordSetMap.get(rrsetKey);
      if (!rrset) throw new Error(`BUG! delete ${rrsetKey}`);

      changes.deletions!.push(rrset);
    }

    for (const [before, after] of changes.Update) {
      const zone = this.findZoneForName(before.DNSName);
      if (!zone) continue;
      const changes = byZone.get(zone)!;

      const rrsetKey = `${before.DNSName}:${before.RecordType}`;
      const rrset = this.recordSetMap.get(rrsetKey);
      if (!rrset) throw new Error(`BUG! update ${rrsetKey}`);

      changes.deletions!.push(rrset);
      changes.additions!.push({
        kind: "dns#resourceRecordSet",
        name: after.DNSName+".",
        type: after.RecordType,
        ttl: after.RecordTTL ?? 300,
        rrdatas: encodeTargets(after.RecordType, after.Targets),
      });
    }

    for (const created of changes.Create) {
      const zone = this.findZoneForName(created.DNSName);
      if (!zone) continue;
      const changes = byZone.get(zone)!;

      changes.additions!.push({
        kind: "dns#resourceRecordSet",
        name: created.DNSName+".",
        type: created.RecordType,
        ttl: created.RecordTTL ?? 300,
        rrdatas: encodeTargets(created.RecordType, created.Targets),
      });
    }

    // Actually submit the changes
    for (const [zone, change] of byZone) {
      if (change.additions!.length < 1 && change.deletions!.length < 1) continue;

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

}

function decodeTargets(recordType: string, targets: string[]) {
  switch (recordType) {
    case 'TXT':
      return targets
        .map(x => x
          .slice(1, -1)
          .replace(/" +"/g, ""));
    case 'CNAME':
    case 'NS':
    case 'PTR':
      return targets.map(x => x
        .endsWith('.')
          ? x.slice(0, -1)
          : x);
    case 'MX':
    case 'SRV':
      throw new Error(`TODO: google dns records with priority`);
    default:
      return targets;
  }
}

function encodeTargets(recordType: string, targets: string[]) {
  switch (recordType) {
    case 'TXT':
      return targets.map(x => (x
        .match(/.{1,255}/g) ?? [])
        .map(x => `"${x}"`)
        .join(' '));
    case 'CNAME':
    case 'NS':
    case 'PTR':
      return targets.map(x => x
        .endsWith('.')
          ? x
          : `${x}.`);
    case 'MX':
    case 'SRV':
      throw new Error(`TODO: google dns records with priority`);
    default:
      return targets;
  }
}
