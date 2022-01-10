import {
  VultrProviderConfig,
  DnsProvider,
  Zone, Endpoint,
} from "../../common/mod.ts";
import { OpaquelyIdentifiedProviderContext, RecordEndpoint } from "../opaquely-identified.ts";
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

export class VultrProviderContext extends OpaquelyIdentifiedProviderContext {
  constructor(
    public config: VultrProviderConfig,
    Zones: Array<Zone>,
    private api: VultrApiSurface,
  ) {
    super(Zones);
  }

  async *enumerateRecords(zone: Zone): AsyncGenerator<RecordEndpoint> {
    for await (const record of this.api.listAllRecords(zone.DNSName)) {
      const priority = (record.type === 'MX' || record.type === 'SRV') ? record.priority : null;
      const dnsName = record.name ? `${record.name}.${zone.DNSName}` : zone.DNSName;
      const target = record.type === 'TXT' ? record.data.slice(1, -1) : record.data; // any others?

      yield {
        RecordID: record.id,
        DNSName: dnsName,
        RecordType: record.type,
        Targets: [target],
        RecordTTL: record.ttl >= 0 ? record.ttl : undefined,
        Priority: priority ?? undefined,
      };
    }
  }

  async createRecord(zone: Zone, endpoint: Endpoint, value: string) {
    await this.api.createRecord(zone.ZoneID, {
      name: endpoint.DNSName == zone.DNSName ? '' : endpoint.DNSName.slice(0, -zone.DNSName.length - 1),
      type: endpoint.RecordType,
      data: endpoint.RecordType === 'TXT' ? `"${value}"` : value,
      ttl: endpoint.RecordTTL ?? undefined,
      priority: endpoint.Priority ?? undefined,
    });
  }

  async deleteRecord(zone: Zone, recordId: string) {
    await this.api.deleteRecord(zone.ZoneID, recordId);
  }
}
