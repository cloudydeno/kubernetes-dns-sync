import { DnsRecord, DnsRecordData, CloudflareApiSurface, CloudflareZone } from "./api.ts";

export class CloudflareApiMock implements CloudflareApiSurface {

  #expectDeletions = new Set<string>();
  #expectCreations = new Set<string>();
  #creationDatas = new Array<{zoneId: string, record: DnsRecord}>();
  #zoneMeta = new Map<string, CloudflareZone>();
  #zones = new Map<string, Array<DnsRecord> | undefined>();

  /** Zone that it is an error to interact with */
  addMockedDeadZone(zoneId: string, domain: string) {
    this.#zoneMeta.set(domain, {
      id: zoneId,
      name: domain,
      created_on: 'no',
      modified_on: 'no',
      status: 'active',
    });
    this.#zones.set(domain, undefined);
  }
  addMockedZone(zoneId: string, domain: string, records: Array<{data: DnsRecordData, expect: 'retained' | 'deletion' | 'creation'}>) {
    this.#zoneMeta.set(domain, {
      id: zoneId,
      name: domain,
      created_on: 'no',
      modified_on: 'no',
      status: 'active',
    });
    this.#zones.set(domain, records.flatMap((input, idx) => {
      const id = `${zoneId}:${idx}:${input.data.type}`;
      const fullRecord: DnsRecord = {
        priority: -1, // TODO: verify actual behavior
        proxied: true,
        ...input.data,
        id,
        proxiable: true,
        created_on: 'no',
        locked: false,
        meta: {},
        modified_on: 'no',
        zone_id: zoneId,
        zone_name: domain,
      };
      if (input.expect == 'creation') {
        this.#expectCreations.add([zoneId, id].join('%'));
        this.#creationDatas.push({zoneId, record: fullRecord});
        return [];
      }
      if (input.expect == 'deletion') {
        this.#expectDeletions.add([zoneId, id].join('%'));
      }
      return [fullRecord];
    }));
  }
  verifyCompletion() {
    if (this.#expectDeletions.size > 0) throw new Error(
      `CloudflareApiMock expected to delete ${Array.from(this.#expectDeletions).join(', ')}`);
    if (this.#expectCreations.size > 0) throw new Error(
      `CloudflareApiMock expected to create ${Array.from(this.#expectCreations).join(', ')}`);
  }

  async *listAllZones(): AsyncGenerator<CloudflareZone,void,undefined> {
    yield* this.#zoneMeta.values();
  }

  async *listAllRecords(zone: string): AsyncGenerator<DnsRecord> {
    const records = this.#zones.get(zone);
    if (!records) throw new Error(`Cloudflare Mock was asked for unexpected domain ${zone}`);
    for (const record of records) {
      yield record;
    }
  }

  createRecord(zoneId: string,
    record: DnsRecordData,
  ): Promise<DnsRecord> {
    const candidate = this.#creationDatas.find(candidate => {
      if (candidate.zoneId !== zoneId) return false;
      if (candidate.record.name !== record.name) return false;
      if (candidate.record.type !== record.type) return false;
      if (candidate.record.content !== record.content) return false;
      return true;
    });
    if (!candidate) throw new Error(
      `Cloudflare Mock refusing unexpected creation in ${zoneId}: ${JSON.stringify(record)}`);
    if (this.#expectCreations.delete([zoneId, candidate.record.id].join('%'))) {
      return Promise.resolve(candidate.record);
    } else {
      return Promise.reject(new Error(`Unexpected creation of ${candidate.record.id} - maybe double called`));
    }
  }

  updateRecord(zoneId: string,
    recordId: string,
    changes: Partial<Omit<DnsRecordData, "type">>,
  ): Promise<DnsRecord> {
    return Promise.reject(new Error('TODO'));
  }

  deleteRecord(zoneId: string,
    recordId: string,
  ): Promise<{id: string}> {
    if (this.#expectDeletions.delete([zoneId, recordId].join('%'))) {
      return Promise.resolve({ id: recordId });
    } else {
      return Promise.reject(new Error(`Unexpected deletion of ${recordId} - maybe double called`));
    }
  }

}
