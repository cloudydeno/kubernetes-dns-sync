import { ttlFromAnnotations } from "../../common/annotations.ts";
import {
  VultrProviderConfig,
  DnsProvider,
  Zone, SourceRecord, BaseRecord, getPlainRecordKey, ZoneDiff,
} from "../../common/mod.ts";
import { VultrApi, VultrApiSurface } from "./api.ts";

type VultrRecord = BaseRecord & {
  // zone: string;
  recordId?: string;
}

const supportedRecords = {
  'A': true,
  'AAAA': true,
  'NS': true,
  'CNAME': true,
  'TXT': true,
  'MX': true,
};

export class VultrProvider implements DnsProvider<VultrRecord> {
  constructor(
    public config: VultrProviderConfig,
    private api: VultrApiSurface = new VultrApi(),
  ) {}

  async ListZones() {
    const zones = new Array<Zone>();
    const domainFilter = new Set(this.config.domain_filter ?? []);
    for await (const {domain} of this.api.listAllZones()) {
      if (domainFilter.size > 0 && !domainFilter.has(domain)) continue;
      zones.push({ DNSName: domain, ZoneID: domain });
    }
    return zones;
  }

  // findZoneForName(dnsName: string): Zone | undefined {
  //   const matches = this.Zones.filter(x => x.DNSName == dnsName || dnsName.endsWith('.'+x.DNSName));
  //   return matches.sort((a,b) => b.DNSName.length - a.DNSName.length)[0];
  // }

  async ListRecords(zone: Zone): Promise<VultrRecord[]> {
    const records = new Array<VultrRecord>();
    for await (const record of this.api.listAllRecords(zone.DNSName)) {
      const recordId = record.id;
      const ttl = record.ttl >= 0 ? record.ttl : undefined;
      const type = record.type as keyof typeof supportedRecords; // this is a lie to get types to help us out more
      const fqdn = record.name ? `${record.name}.${zone.DNSName}` : zone.DNSName;

      switch (type) {
        case 'A':
        case 'AAAA':
        case 'NS':
        case 'CNAME':
          records.push({ recordId, dns: {
            type, ttl, fqdn,
            target: record.data,
          }});
          break;
        case 'TXT':
          records.push({ recordId, dns: {
            type, ttl, fqdn,
            content: record.data.slice(1, -1),
          }});
          break;
        case 'MX':
          records.push({ recordId, dns: {
            type, ttl, fqdn,
            priority: record.priority,
            target: record.data,
          }});
          break;
        default:
          console.error(`TODO: unsupported record type ${type} observed in Vultr zone at ${fqdn}`);
          const _: never = type;
      }
    }
    return records;
  }
  EnrichSourceRecord(record: SourceRecord): VultrRecord | null {
    if (record.dns.type in supportedRecords) {
      return {
        ...record,
        dns: {
          ...record.dns,
          ttl: record.dns.ttl ?? ttlFromAnnotations(record.annotations) ?? 60
        },
      };
    }
    console.error(`TODO: unsupported record type ${record.dns.type} desired for Vultr zone at ${record.dns.fqdn}`);
    return null; // toss unsupported records
  }

  ComparisionKey(record: VultrRecord): string {
    // vultr has no extra config stored with DNS records
    return JSON.stringify(getPlainRecordKey(record.dns));
  }

  async ApplyChanges(diff: ZoneDiff<VultrRecord>): Promise<void> {
    for (const deletion of diff.toDelete) {
      if (!deletion.recordId) throw new Error(`BUG: deleting ID-less Vultr record`);
      await this.deleteRecord(diff.state.Zone, deletion.recordId);
    }
    for (const creation of diff.toCreate) {
      if (creation.recordId) throw new Error(`BUG: creating ID-having Vultr record`);
      await this.createRecord(diff.state.Zone, creation);
    }
  }

  async createRecord(zone: Zone, record: VultrRecord) {
    const {dns} = record;
    if (!dns.fqdn.endsWith(zone.DNSName)) throw new Error(
      `BUG: createRecord ${dns.fqdn} given different zone ${zone.DNSName}`);
    const subdomain = dns.fqdn == zone.DNSName ? '' : dns.fqdn.slice(0, -zone.DNSName.length - 1);

    switch (dns.type) {
      case 'A':
      case 'AAAA':
      case 'NS':
      case 'CNAME':
        await this.api.createRecord(zone.ZoneID, {
          name: subdomain,
          type: dns.type,
          data: dns.target,
          ttl: dns.ttl ?? undefined,
        });
        break;
      case 'TXT':
        await this.api.createRecord(zone.ZoneID, {
          name: subdomain,
          type: dns.type,
          data: `"${dns.content}"`,
          ttl: dns.ttl ?? undefined,
        });
        break;
      case 'MX':
        await this.api.createRecord(zone.ZoneID, {
          name: subdomain,
          type: dns.type,
          data: dns.target,
          ttl: dns.ttl ?? undefined,
          priority: dns.priority,
        });
        break;
      default:
        const _: never = dns;
        throw new Error(`BUG: unsupported record ${JSON.stringify(dns)} desired in Vultr zone`);
    }
  }

  async deleteRecord(zone: Zone, recordId: string) {
    await this.api.deleteRecord(zone.ZoneID, recordId);
  }
}
