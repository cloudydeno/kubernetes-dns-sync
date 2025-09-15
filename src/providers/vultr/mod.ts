import type { VultrProviderConfig } from "../../defs/config.ts";
import type {
  BaseRecord, DnsProvider, Zone, SourceRecord, ZoneState, PlainRecord,
} from "../../defs/types.ts";

import { enrichSourceRecord, getPlainRecordKey } from "../../lib/dns-endpoints.ts";
import { readTxtValue } from "../../lib/dns-rrdata.ts";

import { DnsRecord, DnsRecordData, VultrApi, VultrApiSurface } from "./api.ts";
import { log } from "../../deps.ts";

export type VultrRecord = BaseRecord & {
  // zone: string;
  recordId?: string;
}

type SupportedRecords = DnsRecordData['type'] & PlainRecord['type'];
type UnsupportedRecords = Exclude<PlainRecord['type'], DnsRecordData['type']>;
const unsupportedRecords: Record<UnsupportedRecords, true> = {
  SOA: true,
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
      zones.push({ fqdn: domain, zoneId: domain });
    }
    return zones;
  }

  async ListRecords(zone: Zone): Promise<VultrRecord[]> {
    const records = new Array<VultrRecord>();
    for await (const record of this.api.listAllRecords(zone.fqdn)) {
      const recordData = transformFromApi(zone.fqdn, record);
      if (!recordData) continue;
      records.push({
        recordId: record.id,
        dns: recordData,
      });
    }
    return records;
  }

  EnrichSourceRecord(record: SourceRecord): VultrRecord | null {
    if (record.dns.type in unsupportedRecords) throw new Error(
      `Vultr does not support ${record.dns.type} records.`);

    return enrichSourceRecord(record, {
      minTtl: 120,
      defaultTtl: 120,
    });
  }

  ComparisionKey(record: VultrRecord): string {
    // vultr has no extra config stored with DNS records
    return JSON.stringify(getPlainRecordKey(record.dns));
  }
  GroupingKey(record: VultrRecord): string {
    // only "type" is immutable in the API. we also include FQDN to reduce confusion
    return JSON.stringify([record.dns.fqdn, record.dns.type]);
  }

  async ApplyChanges(state: ZoneState<VultrRecord>): Promise<void> {
    if (!state.Diff) throw new Error(`BUG: missing Diff property`);
    for (const diff of state.Diff) {
      for (const deletion of diff.toDelete) {
        if (!deletion.recordId) throw new Error(`BUG: deleting ID-less Vultr record`);
        await this.api.deleteRecord(state.Zone.zoneId, deletion.recordId);
      }
      for (const update of diff.toUpdate) {
        if (!update.existing.recordId) throw new Error(`BUG: updating ID-less Vultr record`);
        const record = transformForApi(state.Zone.fqdn, update.desired.dns);
        await this.api.updateRecord(state.Zone.zoneId, update.existing.recordId, record);
      }
      for (const creation of diff.toCreate) {
        if (creation.recordId) throw new Error(`BUG: creating ID-having Vultr record`);
        const record = transformForApi(state.Zone.fqdn, creation.dns);
        await this.api.createRecord(state.Zone.zoneId, record);
      }
    }
  }
}


function transformFromApi(zoneFqdn: string, record: DnsRecord): PlainRecord | false {
  // this is a lie to get types to help us out more:
  const type = record.type as SupportedRecords;

  const ttl = record.ttl >= 0 ? record.ttl : undefined;
  const fqdn = record.name ? `${record.name}.${zoneFqdn}` : zoneFqdn;

  switch (type) {
    case 'A':
    case 'AAAA':
    case 'NS':
    case 'CNAME':
      return {
        type, ttl, fqdn,
        target: record.data,
      };
    case 'TXT':
      return {
        type, ttl, fqdn,
        content: readTxtValue(record.data),
      };
    case 'MX':
      return {
        type, ttl, fqdn,
        priority: record.priority,
        target: record.data,
      };
    case 'SRV': {
      const [weight, port, target] = record.data.split(' ');
      return {
        type, ttl, fqdn,
        priority: record.priority,
        weight: parseInt(weight, 10),
        port: parseInt(port, 10),
        target: target.replace(/\.$/, ''),
      };
    }
    default:
      log.warn(`TODO: unsupported record type ${type} observed in Vultr zone at ${fqdn}`);
      const _: never = type;
  }
  return false;
}

function transformForApi(zoneFqdn: string, dns: PlainRecord): DnsRecordData {
  if (!dns.fqdn.endsWith(zoneFqdn)) throw new Error(
    `BUG: Vultr given wrong zone ${zoneFqdn} for record ${dns.fqdn}`);
  const subdomain = dns.fqdn == zoneFqdn ? '' : dns.fqdn.slice(0, -zoneFqdn.length - 1);

  switch (dns.type) {
    case 'A':
    case 'AAAA':
    case 'NS':
    case 'CNAME':
      return {
        name: subdomain,
        type: dns.type,
        data: dns.target,
        ttl: dns.ttl ?? undefined,
      };
    case 'TXT':
      return {
        name: subdomain,
        type: dns.type,
        data: `"${dns.content}"`,
        ttl: dns.ttl ?? undefined,
      };
    case 'MX':
      return {
        name: subdomain,
        type: dns.type,
        data: dns.target,
        ttl: dns.ttl ?? undefined,
        priority: dns.priority,
      };
    case 'SRV':
      // const [weight, port, target] = dns.tar
      return {
        name: subdomain,
        type: dns.type,
        data: `${dns.weight} ${dns.port} ${dns.target}`,
        ttl: dns.ttl ?? undefined,
        priority: dns.priority,
      };
    case 'SOA': throw new Error(`Vultr does not support 'SOA' records`);
    default:
      const _: never = dns;
  }
  throw new Error(`BUG: unsupported record ${JSON.stringify(dns)} desired in Vultr zone`);
}
