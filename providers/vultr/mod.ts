import { VultrProviderConfig, Changes, DnsProvider, Endpoint } from "../../common/mod.ts";
import { VultrApi } from "./api.ts";

// Store metadata on our Endpoints because the API has its own opaque per-target IDs
type VultrEntry = Endpoint & {
  vultrIds: string[];
  vultrZone: string;
};

export class VultrProvider implements DnsProvider {
  constructor(public config: VultrProviderConfig) {}
  #api = new VultrApi();
  domainFilter = new Set(this.config.domain_filter ?? []);

  async Records(): Promise<Endpoint[]> {
    const endpoints = new Array<Endpoint>(); // every recordset we find
    for await (const {domain} of this.#api.listAllZones()) {
      if (this.domainFilter.size > 0 && !this.domainFilter.has(domain)) continue;

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
            vultrZone: domain,
            SplitOutTarget,
          };
          endpoints.push(endp);
          endpMap.set(mapKey, endp);
        }

      }
    }
    return endpoints;
  }

  async ApplyChanges(changes: Changes): Promise<void> {
    console.log(changes.Create, changes.Update, changes.Delete);
    if (prompt(`Proceed with editing Vultr records?`, 'yes') !== 'yes') throw new Error(
      `User declined to perform Vultr operations`);

    for (const deleted of changes.Delete as VultrEntry[]) {
      if (!deleted.vultrIds || deleted.vultrIds.length !== deleted.Targets.length) throw new Error(`BUG`);
      for (const id of deleted.vultrIds) {
        await this.#api.deleteRecord(deleted.vultrZone, id);
      }
    }

    for (const [before, after] of changes.Update as Array<[VultrEntry, Endpoint]>) {
      const zone = before.vultrZone;
      // TODO: be more efficient with updating-in-place
      for (const recordId of before.vultrIds) {
        await this.#api.deleteRecord(zone, recordId);
      }
      for (const target of after.Targets) {
        await this.#api.createRecord(zone, {
          name: after.DNSName == zone ? '' : after.DNSName.slice(0, -zone.length - 1),
          type: after.RecordType,
          data: after.RecordType === 'TXT' ? `"${target}"` : target,
          ttl: after.RecordTTL ?? undefined,
          priority: after.Priority ?? undefined,
        });
      }
    }

    for (const created of changes.Create) {
      const zone = 'devmode.cloud';
      for (const target of created.Targets) {
        await this.#api.createRecord(zone, {
          name: created.DNSName == zone ? '' : created.DNSName.slice(0, -zone.length - 1),
          type: created.RecordType,
          data: created.RecordType === 'TXT' ? `"${target}"` : target,
          ttl: created.RecordTTL ?? undefined,
          priority: created.Priority ?? undefined,
        });
      }
    }

    // throw new Error("Method not implemented.");
  }

}

/// Support splitting records and still keeping vultrIds
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
