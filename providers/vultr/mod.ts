import {
  VultrProviderConfig,
  DnsProvider, DnsProviderContext,
  Zone, Endpoint, Changes,
} from "../../common/mod.ts";
import { VultrApi, VultrApiSurface } from "./api.ts";

export class VultrProvider implements DnsProvider<VultrProviderContext> {
  constructor(
    public config: VultrProviderConfig,
    private api: VultrApiSurface = new VultrApi(),
  ) {}

	async NewContext() {
    const zones = new Array<Zone>();
    const domainFilter = new Set(this.config.domain_filter ?? []);
    for await (const {domain} of this.api.listAllZones()) {
      if (domainFilter.size > 0 && !domainFilter.has(domain)) continue;
      zones.push({DNSName: domain, ZoneID: domain});
    }
    return new VultrProviderContext(this.config, zones, this.api);
  }

}
export class VultrProviderContext implements DnsProviderContext {
  constructor(
    public config: VultrProviderConfig,
    public Zones: Array<Zone>,
    private api: VultrApiSurface,
  ) {}

  private recordIds = new Map<string, string>();
  private recordKey(name: string, type: string, priority: number | null | undefined, value: string) {
    return JSON.stringify([name, type, priority ?? null, value]);
  }

  findZoneForName(dnsName: string): Zone | undefined {
    const matches = this.Zones.filter(x => x.DNSName == dnsName || dnsName.endsWith('.'+x.DNSName));
    return matches.sort((a,b) => b.DNSName.length - a.DNSName.length)[0];
  }

  async Records(): Promise<Endpoint[]> {
    const endpoints = new Array<Endpoint>(); // every recordset we find
    for (const zone of this.Zones) {

      const endpMap = new Map<string, Endpoint>(); // collapse targets with same name/type/priority
      for await (const record of this.api.listAllRecords(zone.DNSName)) {

        const priority = (record.type === 'MX' || record.type === 'SRV') ? record.priority : null;
        const dnsName = record.name ? `${record.name}.${zone.DNSName}` : zone.DNSName;
        const mapKey = [record.name, record.type, priority].join(':');
        const target = record.type === 'TXT' ? record.data.slice(1, -1) : record.data; // any others?

        const recordKey = this.recordKey(dnsName, record.type, priority, target);
        if (this.recordIds.has(recordKey)) throw new Error(`Record key ${recordKey} overlapped`);
        this.recordIds.set(recordKey, record.id);

        const existingEndp = endpMap.get(mapKey);
        if (existingEndp) {
          existingEndp.Targets.push(target);
        } else {
          const endp: Endpoint = {
            DNSName: dnsName,
            RecordType: record.type,
            Targets: [target],
            RecordTTL: record.ttl >= 0 ? record.ttl : undefined,
            Priority: priority ?? undefined,
          };
          endpoints.push(endp);
          endpMap.set(mapKey, endp);
        }

      }
    }
    return endpoints;
  }

  async ApplyChanges(changes: Changes): Promise<void> {

    for (const deleted of changes.Delete as Endpoint[]) {
      const zone = this.findZoneForName(deleted.DNSName);
      if (!zone) throw new Error(`Vultr zone not found for ${deleted.DNSName}`);

      for (const target of deleted.Targets) {
        const recordKey = this.recordKey(deleted.DNSName, deleted.RecordType, deleted.Priority, target);
        const recordId = this.recordIds.get(recordKey);
        if (!recordId) throw new Error(`BUG: No vultr record ID found for ${recordKey}`);

        await this.api.deleteRecord(zone.ZoneID, recordId);
      }
    }

    for (const [before, after] of changes.Update as Array<[Endpoint, Endpoint]>) {
      const zone = this.findZoneForName(before.DNSName);
      if (!zone) throw new Error(`Vultr zone not found for ${before.DNSName}`);

      // TODO: be more efficient with updating-in-place
      for (const target of before.Targets) {
        const recordKey = this.recordKey(before.DNSName, before.RecordType, before.Priority, target);
        const recordId = this.recordIds.get(recordKey);
        if (!recordId) throw new Error(`BUG: No vultr record ID found for ${recordKey}`);

        await this.api.deleteRecord(zone.ZoneID, recordId);
      }
      for (const target of after.Targets) {
        await this.api.createRecord(zone.ZoneID, {
          name: after.DNSName == zone.DNSName ? '' : after.DNSName.slice(0, -zone.DNSName.length - 1),
          type: after.RecordType,
          data: after.RecordType === 'TXT' ? `"${target}"` : target,
          ttl: after.RecordTTL ?? undefined,
          priority: after.Priority ?? undefined,
        });
      }
    }

    for (const created of changes.Create) {
      const zone = this.findZoneForName(created.DNSName);
      if (!zone) throw new Error(`Vultr zone not found for ${created.DNSName}`);

      for (const target of created.Targets) {
        await this.api.createRecord(zone.ZoneID, {
          name: created.DNSName.slice(0, -zone.DNSName.length - 1),
          type: created.RecordType,
          data: created.RecordType === 'TXT' ? `"${target}"` : target,
          ttl: created.RecordTTL ?? undefined,
          priority: created.Priority ?? undefined,
        });
      }
    }

  }

}
