import { JsonClient } from "../../lib/json-client.ts";

export interface VultrApiSurface {
  listAllZones(): AsyncGenerator<DomainRecord>;
  listAllRecords(zone: string): AsyncGenerator<DnsRecord>;

  createRecord(zone: string,
    record: DnsRecordData,
  ): Promise<DnsRecord>;
  updateRecord(zone: string,
    recordId: string,
    changes: Partial<Omit<DnsRecordData, "type">>,
  ): Promise<void>;
  deleteRecord(zone: string,
    recordId: string,
  ): Promise<void>;
}

export class VultrApi extends JsonClient implements VultrApiSurface {

  #apiKey: string;
  constructor() {
    super('vultr', `https://api.vultr.com/v2/`);

    const apiKey = Deno.env.get('VULTR_API_KEY');
    if (!apiKey) throw new Error(`VULTR_API_KEY is required to use Vultr`);
    this.#apiKey = apiKey;
  }
  protected addAuthHeaders(headers: Headers) {
    headers.set('authorization', `Bearer ${this.#apiKey}`);
  }

  listZones(pageToken?: string) {
    const query = new URLSearchParams;
    if (pageToken) query.set('cursor', pageToken);
    return this.doHttp<DomainList>({ path: `domains`, query });
  }
  async *listAllZones() {
    let page: DomainList | undefined;
    do {
      page = await this.listZones(page?.meta.links.next);
      yield* page.domains;
    } while (page.meta.links.next);
  }

  listRecords(zone: string, pageToken?: string) {
    if (!zone) throw new Error(`Zone is required`);
    const query = new URLSearchParams;
    if (pageToken) query.set('cursor', pageToken);
    return this.doHttp<RecordList>({ path: `domains/${zone}/records`, query });
  }
  async *listAllRecords(zone: string) {
    let page: RecordList | undefined;
    do {
      page = await this.listRecords(zone, page?.meta.links.next);
      yield* page.records;
    } while (page.meta.links.next);
  }

  createRecord(zone: string, record: DnsRecordData) {
    if (!zone) throw new Error(`Zone is required`);
    if (!record) throw new Error(`Record is required`);
    return this.doHttp<DnsRecord>({
      path: `domains/${zone}/records`,
      method: 'POST',
      jsonBody: record,
    });
  }

  async updateRecord(zone: string, recordId: string, changes: Partial<Omit<DnsRecordData, "type">>) {
    if (!zone) throw new Error(`Zone is required`);
    if (!recordId) throw new Error(`Record ID is required`);
    if (!changes) throw new Error(`Record changes are required`);
    await this.doHttp({
      path: `domains/${zone}/records/${recordId}`,
      method: 'PATCH',
      jsonBody: changes,
    });
  }

  async deleteRecord(zone: string, recordId: string) {
    if (!zone) throw new Error(`Zone is required`);
    if (!recordId) throw new Error(`Record ID is required`);
    await this.doHttp({
      path: `domains/${zone}/records/${recordId}`,
      method: 'DELETE',
    });
  }
}

export interface DomainRecord {
  domain: string;
  date_created: string;
};

export interface DomainList {
  domains: Array<DomainRecord>;
  meta: ListMeta;
};

export interface DnsRecordData {
  type:
    | 'A'
    | 'AAAA'
    | 'CNAME'
    | 'NS'
    | 'MX'
    | 'SRV'
    | 'TXT'
    | 'CAA'
    | 'SSHFP'
  ;
  name: string;
  data: string;
  priority?: number;
  ttl?: number;
}

export interface DnsRecord extends DnsRecordData {
  id: string;
  priority: number;
  ttl: number;
}

export interface RecordList {
  records: Array<DnsRecord>;
  meta: ListMeta;
}

export interface ListMeta {
  total: number;
  links: {
    next: string, prev: string;
  };
}
