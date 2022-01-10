import { DnsRecord, DnsRecordData, DomainRecord, VultrApiSurface } from "./api.ts";

export class VultrApiMock implements VultrApiSurface {

  #expectDeletions = new Set<string>();
  #expectCreations = new Set<string>();
  #creationDatas = new Array<{domain: string, record: DnsRecord}>();
  #zones = new Map<string, Array<DnsRecord> | undefined>();

  /** Zone that it is an error to interact with */
  addMockedDeadZone(domain: string) {
    this.#zones.set(domain, undefined);
  }
  addMockedZone(domain: string, records: Array<{data: DnsRecordData, expect: 'retained' | 'deletion' | 'creation'}>) {
    this.#zones.set(domain, records.flatMap((input, idx) => {
      const id = `${domain}:${idx}:${input.data.type}`;
      const fullRecord: DnsRecord = {
        priority: -1, // TODO: verify actual behavior
        ttl: 60, // TODO: verify actual behaivor
        ...input.data,
        id,
      };
      if (input.expect == 'creation') {
        this.#expectCreations.add([domain, id].join('%'));
        this.#creationDatas.push({domain, record: fullRecord});
        return [];
      }
      if (input.expect == 'deletion') {
        this.#expectDeletions.add([domain, id].join('%'));
      }
      return [fullRecord];
    }));
  }
  verifyCompletion() {
    if (this.#expectDeletions.size > 0) throw new Error(
      `VultrApiMock expected to delete ${Array.from(this.#expectDeletions).join(', ')}`);
    if (this.#expectCreations.size > 0) throw new Error(
      `VultrApiMock expected to create ${Array.from(this.#expectCreations).join(', ')}`);
  }

  async *listAllZones(): AsyncGenerator<DomainRecord> {
    const date_created = 'mock';
    for (const domain of this.#zones.keys()) {
      yield { domain, date_created };
    }
  }

  async *listAllRecords(zone: string): AsyncGenerator<DnsRecord> {
    const records = this.#zones.get(zone);
    if (!records) throw new Error(`Vultr Mock was asked for unexpected domain ${zone}`);
    for (const record of records) {
      yield record;
    }
  }

  createRecord(zone: string,
    record: DnsRecordData,
  ): Promise<DnsRecord> {
    const candidate = this.#creationDatas.find(candidate => {
      if (candidate.domain !== zone) return false;
      if (candidate.record.name !== record.name) return false;
      if (candidate.record.type !== record.type) return false;
      if (candidate.record.data !== record.data) return false;
      return true;
    });
    if (!candidate) throw new Error(
      `Vultr Mock refusing unexpected creation in ${zone}: ${JSON.stringify(record)}`);
    if (this.#expectCreations.delete([zone, candidate.record.id].join('%'))) {
      return Promise.resolve(candidate.record);
    } else {
      return Promise.reject(new Error(`Unexpected creation of ${candidate.record.id} - maybe double called`));
    }
  }

  updateRecord(zone: string,
    recordId: string,
    changes: Partial<Omit<DnsRecordData, "type">>,
  ): Promise<void> {
    return Promise.reject(new Error('TODO'));
  }

  deleteRecord(zone: string,
    recordId: string,
  ): Promise<void> {
    if (this.#expectDeletions.delete([zone, recordId].join('%'))) {
      return Promise.resolve();
    } else {
      return Promise.reject(new Error(`Unexpected deletion of ${recordId} - maybe double called`));
    }
  }

}
