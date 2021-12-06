import {
  PowerDnsProviderConfig,
  DnsProvider, DnsProviderContext,
  Zone, Endpoint, Changes,
} from "../../common/mod.ts";
import { PowerDnsApi } from "./api.ts";

export class PowerDnsProvider implements DnsProvider<PowerDnsProviderContext> {
  constructor(
    public config: PowerDnsProviderConfig,
  ) {
    this.api = new PowerDnsApi(
      this.config.api_endpoint ?? 'http://127.0.0.1:8081/api/',
      this.config.server_id ?? 'localhost');
  }
  api: PowerDnsApi;

	async NewContext() {
    const zones = new Array<Zone>();
    const domainFilter = new Set(this.config.domain_filter ?? []);
    for (const zone of await this.api.listAllZones()) {
      if (domainFilter.size > 0 && !domainFilter.has(zone.name)) continue;
      zones.push({DNSName: zone.name.slice(0, -1), ZoneID: zone.id});
    }
    return new PowerDnsProviderContext(this.config, zones, this.api);
  }

}
export class PowerDnsProviderContext implements DnsProviderContext {
  constructor(
    public config: PowerDnsProviderConfig,
    public Zones: Array<Zone>,
    private api: PowerDnsApi,
  ) {}

  findZoneForName(dnsName: string): Zone | undefined {
    const matches = this.Zones.filter(x => x.DNSName == dnsName || dnsName.endsWith('.'+x.DNSName));
    return matches.sort((a,b) => b.DNSName.length - a.DNSName.length)[0];
  }

  async Records(): Promise<Endpoint[]> {
    const endpoints = new Array<Endpoint>(); // every recordset we find
    for (const zone of this.Zones) {

      const zoneData = await this.api.getZone(zone.DNSName);
      for (const recordSet of zoneData.rrsets) {
        endpoints.push({
          DNSName: recordSet.name.slice(0, -1),
          RecordType: recordSet.type,
          Targets: recordSet.records.map(x =>
            recordSet.type === 'TXT' // any others?
            ? x.content.slice(1, -1)
            : x.content),
          RecordTTL: recordSet.ttl ?? undefined,
          Priority: recordSet.priority ?? undefined,
        });
      }
    }
    return endpoints;
  }

  async ApplyChanges(changes: Changes): Promise<void> {

    const zoneCreates = changes.Create.map(x => ({
      type: 'create' as const, endpoint: x,
      zone: this.findZoneForName(x.DNSName)?.ZoneID,
    }));
    const zoneDeletes = changes.Delete.map(x => ({
      type: 'delete' as const, endpoint: x,
      zone: this.findZoneForName(x.DNSName)?.ZoneID,
    }));
    const zoneUpdates = changes.Update.map(([old, x]) => ({
      type: 'replace' as const, endpoint: x,
      zone: this.findZoneForName(x.DNSName)?.ZoneID,
    }));

    const allChanges = [...zoneCreates, ...zoneDeletes, ...zoneUpdates];
    const allZoneChanges = allChanges.reduce((map, change) => {
      if (!change.zone) return map;
      if (!map.has(change.zone)) map.set(change.zone, new Array());
      map.get(change.zone)!.push(change);
      return map;
    }, new Map<string,typeof allChanges>());

    for (const [zoneId, changeList] of allZoneChanges) {
      console.log('powerdns: Have', changeList.length, 'changes for', zoneId);

      await this.api.patchZoneRecords(zoneId, changeList.map(change => ({
        name: change.endpoint.DNSName+'.',
        type: change.endpoint.RecordType,
        ttl: change.endpoint.RecordTTL ?? 300,
        priority: change.endpoint.Priority,
        changetype: change.type === 'delete' ? 'DELETE' : 'REPLACE',
        comments: [],
        records: change.endpoint.Targets.map(y => ({
          content: change.endpoint.RecordType === 'TXT' ? `"${y}"` : y,
          disabled: false,
        })),
      })));
    }

  }

}
