import { Changes, DnsProviderContext, Endpoint, Zone } from "../common/contract.ts";

export type RecordEndpoint = Endpoint & {
  Targets: [string]; // enforce exactly one value
  RecordID: string;
};

/**
 * Base class implementing common logic for providers which
 * assign every record value/target its own opaque "record ID".
 * Many smaller API-first cloud providers do this when they add a DNS offering.
 * Examples: Cloudflare, Vultr
 * Note that this API design generally lacks atomic zone updates,
 * as deleting a record and creating its replacement becomes two API calls.
 *
 * Larger clouds (such as Google and AWS) tend to focus instead on atomic "record set" upserts,
 * so this tracking logic is not useful for using their APIs.
 */
export abstract class OpaquelyIdentifiedProviderContext implements DnsProviderContext {
  constructor(
    public Zones: Array<Zone>,
  ) {}

  abstract enumerateRecords(zone: Zone): AsyncGenerator<RecordEndpoint>;
  abstract createRecord(zone: Zone, endpoint: Endpoint, value: string): Promise<void>;
  abstract deleteRecord(zone: Zone, recordId: string): Promise<void>;

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

      for await (const {RecordID, ...record} of this.enumerateRecords(zone)) {
        if (record.Targets.length !== 1) throw new Error(
          `BUG: Expected provider Endpoint to have exactly 1 target, not ${record.Targets.length}`);

        const mapKey = [record.DNSName, record.RecordType, record.Priority].join(':');

        const recordKey = this.recordKey(record.DNSName, record.RecordType, record.Priority, record.Targets[0]);
        if (this.recordIds.has(recordKey)) throw new Error(`Record key ${recordKey} overlapped`);
        this.recordIds.set(recordKey, RecordID);

        const existingEndp = endpMap.get(mapKey);
        if (existingEndp) {
          existingEndp.Targets.push(record.Targets[0]);
        } else {
          // how is this type-sound? once it's in endpoints, Targets can have more values added
          record.Targets = [record.Targets[0]];
          endpoints.push(record);
          endpMap.set(mapKey, record);
        }

      }
    }
    return endpoints;
  }

  async ApplyChanges(changes: Changes): Promise<void> {

    for (const deleted of changes.Delete as Endpoint[]) {
      const zone = this.findZoneForName(deleted.DNSName);
      if (!zone) throw new Error(`Zone not found for ${deleted.DNSName}`);

      for (const target of deleted.Targets) {
        const recordKey = this.recordKey(deleted.DNSName, deleted.RecordType, deleted.Priority, target);
        const recordId = this.recordIds.get(recordKey);
        if (!recordId) throw new Error(`BUG: No record ID found for ${recordKey}`);

        await this.deleteRecord(zone, recordId);
      }
    }

    for (const [before, after] of changes.Update as Array<[Endpoint, Endpoint]>) {
      const zone = this.findZoneForName(before.DNSName);
      if (!zone) throw new Error(`zone not found for ${before.DNSName}`);

      // TODO: be more efficient with updating-in-place
      for (const target of before.Targets) {
        const recordKey = this.recordKey(before.DNSName, before.RecordType, before.Priority, target);
        const recordId = this.recordIds.get(recordKey);
        if (!recordId) throw new Error(`BUG: No record ID found for ${recordKey}`);

        await this.deleteRecord(zone, recordId);
      }
      for (const target of after.Targets) {
        await this.createRecord(zone, after, target);
      }
    }

    for (const created of changes.Create) {
      const zone = this.findZoneForName(created.DNSName);
      if (!zone) throw new Error(`zone not found for ${created.DNSName}`);

      for (const target of created.Targets) {
        await this.createRecord(zone, created, target);
      }
    }

  }

}
