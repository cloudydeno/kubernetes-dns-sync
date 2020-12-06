import { VultrProviderConfig, Changes, DnsProvider, Endpoint } from "../../common/mod.ts";
import { VultrApi } from "./api.ts";

// Store metadata on our Endpoints because the API has its own opaque per-target IDs
type VultrEntry = Endpoint & {
  vultrIds: string[];
};

export class VultrProvider implements DnsProvider {
  constructor(public config: VultrProviderConfig) {}
  #api = new VultrApi();

  async Records(): Promise<Endpoint[]> {
    const endpoints = new Array<Endpoint>(); // every recordset we find
    for await (const {domain} of this.#api.listAllZones()) {
      const endpMap = new Map<string, VultrEntry>(); // collapse targets with same name/type/priority
      for await (const record of this.#api.listAllRecords(domain)) {

        const priority = (record.type === 'MX' || record.type === 'SRV') ? record.priority : null;
        const dnsName = record.name ? `${record.name}.${domain}` : domain;
        const mapKey = [record.name, record.type, priority].join(':');
        const target = record.type === 'TXT' ? record.data.slice(1, -1) : record.data; // any others?

        const existingEndp = endpMap.get(mapKey);
        if (existingEndp) {
          existingEndp.Targets.push(target);
          existingEndp.vultrIds.push(record.id);
        } else {
          const endp: VultrEntry = {
            DNSName: dnsName,
            RecordType: record.type,
            Targets: [target],
            RecordTTL: record.ttl >= 0 ? record.ttl : undefined,
            Priority: priority ?? undefined,
            vultrIds: [record.id],
            SplitOutTarget,
          };
          endpoints.push(endp);
          endpMap.set(mapKey, endp);
        }

      }
    }
    return endpoints;
  }

  ApplyChanges(changes: Changes): Promise<void> {
    throw new Error("Method not implemented.");
  }

}

/// Basic function for non-special cases
export function SplitOutTarget(this: VultrEntry, predicate: (t: string) => boolean): [VultrEntry, VultrEntry] {
  const idxs = new Set(this.Targets.flatMap((x, idx) => predicate(x) ? [idx] : []));
  return [{
    ...this,
    Targets: this.Targets.flatMap((x, idx) => idxs.has(idx) ? [x] : []),
    vultrIds: this.vultrIds.flatMap((x, idx) => idxs.has(idx) ? [x] : []),
  }, {
    ...this,
    Targets: this.Targets.flatMap((x, idx) => idxs.has(idx) ? [] : [x]),
    vultrIds: this.vultrIds.flatMap((x, idx) => idxs.has(idx) ? [] : [x]),
  }];
}
