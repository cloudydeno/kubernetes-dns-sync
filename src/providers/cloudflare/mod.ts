import { log } from "../../deps.ts";

import type { CloudflareProviderConfig } from "../../defs/config.ts";
import type {
  BaseRecord, DnsProvider, PlainRecord, SourceRecord, Zone, ZoneState,
} from "../../defs/types.ts";

import { enrichSourceRecord, getPlainRecordKey } from "../../lib/dns-endpoints.ts";
import { readTxtValue } from "../../lib/dns-rrdata.ts";
import { CloudflareApi, CloudflareApiSurface, DnsRecord, DnsRecordData } from "./api.ts";

export const ProxiedAnnotation = `external-dns.alpha.kubernetes.io/cloudflare-proxied`;

export type CloudflareRecord = BaseRecord & {
  recordId?: string;
  proxied?: boolean;
}

type UnsupportedRecords = Exclude<PlainRecord['type'], DnsRecordData['type']>;
const unsupportedRecords: Record<UnsupportedRecords, true> = {
  SOA: true,
}

export function canBeProxied(record: {
  fqdn: string;
  type: string;
}, config?: CloudflareProviderConfig) {
  const unproxyable = new Set(['LOC', 'MX', 'NS', 'SPF', 'TXT', 'SRV']);
  if (unproxyable.has(record.type)) return false;
  if (record.fqdn.includes('*') && !config?.allow_proxied_wildcards) return false;
  // TODO: also private IPv4 space
  return true;
}

export class CloudflareProvider implements DnsProvider<CloudflareRecord> {
  constructor(
    public config: CloudflareProviderConfig,
    private api: CloudflareApiSurface = new CloudflareApi(),
  ) {}

  async ListZones() {
    const zones = new Array<Zone>();
    const domainFilter = new Set(this.config.domain_filter ?? []);
    const zoneIdFilter = new Set(this.config.zone_id_filter ?? []);
    for await (const zone of this.api.listAllZones(this.config.account_id)) {
      if (domainFilter.size > 0 && !domainFilter.has(zone.name)) continue;
      if (zoneIdFilter.size > 0 && !zoneIdFilter.has(zone.id)) continue;
      zones.push({ fqdn: zone.name, zoneId: zone.id });
    }
    return zones;
  }

  async ListRecords(zone: Zone): Promise<CloudflareRecord[]> {
    const records = new Array<CloudflareRecord>();
    for await (const record of this.api.listAllRecords(zone.zoneId)) {
      const recordData = transformFromApi(zone.fqdn, record);
      if (!recordData) continue;
      records.push({
        recordId: record.id,
        proxied: record.proxied,
        dns: recordData,
      });
    }
    return records;
  }

  EnrichSourceRecord(record: SourceRecord): CloudflareRecord | null {
    if (record.dns.type in unsupportedRecords) throw new Error(
      `Cloudflare does not support ${record.dns.type} records.`);

    const enriched = enrichSourceRecord(record, {
      minTtl: 1,
      defaultTtl: 1,
    });
    if (!enriched) return enriched;

    const annotationVal = record.annotations[ProxiedAnnotation];
    const proxyable = canBeProxied(enriched.dns, this.config);
    const proxied = proxyable &&
      ((annotationVal ? annotationVal == 'true' : null)
        ?? this.config.proxied_by_default
        ?? false);

    return { proxied, ...enriched };
  }

  ComparisionKey(record: CloudflareRecord): string {
    return JSON.stringify([...getPlainRecordKey(record.dns), record.proxied]);
  }
  GroupingKey(record: CloudflareRecord): string {
    // only "type" is immutable in the API. we also include FQDN to reduce confusion
    return JSON.stringify([record.dns.fqdn, record.dns.type]);
  }

  async ApplyChanges(state: ZoneState<CloudflareRecord>): Promise<void> {
    if (!state.Diff) throw new Error(`BUG: missing Diff property`);
    for (const diff of state.Diff) {
      for (const deletion of diff.toDelete) {
        if (!deletion.recordId) throw new Error(`BUG: deleting ID-less Cloudflare record`);
        await this.api.deleteRecord(state.Zone.zoneId, deletion.recordId);
      }
      for (const update of diff.toUpdate) {
        if (!update.existing.recordId) throw new Error(`BUG: updating ID-less Cloudflare record`);
        const record = transformForApi(state.Zone.fqdn, update.desired.dns, update.desired.proxied ?? false);
        await this.api.updateRecord(state.Zone.zoneId, update.existing.recordId, record);
      }
      for (const creation of diff.toCreate) {
        if (creation.recordId) throw new Error(`BUG: creating ID-having Cloudflare record`);
        const record = transformForApi(state.Zone.fqdn, creation.dns, creation.proxied ?? false);
        await this.api.createRecord(state.Zone.zoneId, record);
      }
    }
  }
}

function transformFromApi(zoneFqdn: string, record: DnsRecord): PlainRecord | false {
  // this is a lie to get types to help us out more:
  const type = record.type as Exclude<PlainRecord['type'], UnsupportedRecords>;

  const fqdn = record.name;
  const ttl = record.ttl >= 0 ? record.ttl : undefined;

  switch (type) {
    case 'A':
    case 'AAAA':
    case 'NS':
    case 'CNAME':
      return {
        type, ttl, fqdn,
        target: record.content,
      };
    case 'TXT':
      return {
        type, ttl, fqdn,
        content: readTxtValue(record.content),
      };
    case 'MX':
      return {
        type, ttl, fqdn,
        priority: record.priority ?? 0,
        target: record.content,
      };
    case 'SRV': {
      const [weight, port, target] = record.content.split(' ');
      return {
        type, ttl, fqdn,
        priority: record.priority ?? 0,
        weight: parseInt(weight, 10),
        port: parseInt(port, 10),
        target: target.replace(/\.$/, ''),
      };
    }
    default:
      log.debug(`TODO: unsupported record type ${type} observed in Cloudflare zone at ${fqdn}`);
      const _: never = type;
  }
  return false;
}

function transformForApi(zoneFqdn: string, dns: PlainRecord, proxied: boolean): DnsRecordData {
  if (!dns.fqdn.endsWith(zoneFqdn)) throw new Error(
    `BUG: Cloudflare given wrong zone ${zoneFqdn} for record ${dns.fqdn}`);

  switch (dns.type) {
    case 'A':
    case 'AAAA':
    case 'NS':
    case 'CNAME':
      return {
        name: dns.fqdn,
        type: dns.type,
        proxied,
        content: dns.target,
        ttl: dns.ttl ?? 1,
      };
    case 'TXT':
      return {
        name: dns.fqdn,
        type: dns.type,
        proxied,
        content: `"${dns.content}"`,
        ttl: dns.ttl ?? 1,
      };
    case 'MX':
      return {
        name: dns.fqdn,
        type: dns.type,
        proxied,
        content: dns.target,
        ttl: dns.ttl ?? 1,
        priority: dns.priority,
      };
    case 'SRV':
      return {
        name: dns.fqdn,
        type: dns.type,
        proxied,
        content: `${dns.weight} ${dns.port} ${dns.target}`,
        ttl: dns.ttl ?? 1,
        priority: dns.priority,
      };
    case 'SOA': throw new Error(`Cloudflare does not support "SOA" records`);
    default:
      const _: never = dns;
  }
  throw new Error(`BUG: unsupported record ${JSON.stringify(dns)} desired in Cloudflare zone`);
}
