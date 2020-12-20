export class VultrApi {

  #apiKey: string;
  constructor() {
    const apiKey = Deno.env.get('VULTR_API_KEY');
    if (!apiKey) throw new Error(`VULTR_API_KEY is required to use Vultr`);
    this.#apiKey = apiKey;
  }

  async _doHttp(path: string, opts?: RequestInit & {query?: URLSearchParams}) {
    if (opts?.query?.toString()) {
      path += (path.includes('?') ? '&' : '?') + opts.query.toString();
    }
    const headers = new Headers(opts?.headers);
    headers.set('authorization', `Bearer ${this.#apiKey}`);
    headers.set('accept', `application/json`);
    const resp = await fetch(new URL(path, `https://api.vultr.com`), {
      ...opts,
      headers,
    });
    console.error('   ', opts?.method ?? 'GET', 'vultr', path, resp.status);
    if (resp.status == 204) {
      resp.text();
      return null;
    } else if (resp.status >= 400) {
      const text = await resp.text();
      throw new Error(`Vultr HTTP ${resp.status} ${resp.statusText}: ${text}`);
    }
    return await resp.json();
  }

  listZones(pageToken?: string): Promise<DomainList> {
    const query = new URLSearchParams;
    if (pageToken) query.set('cursor', pageToken);
    return this._doHttp(`/v2/domains`, {query});
  }
  async *listAllZones() {
    let page: DomainList | undefined;
    do {
      page = await this.listZones(page?.meta.links.next);
      yield* page.domains;
    } while (page.meta.links.next);
  }

  listRecords(zone: string, pageToken?: string): Promise<RecordList> {
    if (!zone) throw new Error(`Zone is required`);
    const query = new URLSearchParams;
    if (pageToken) query.set('cursor', pageToken);
    return this._doHttp(`/v2/domains/${zone}/records`, {query});
  }
  async *listAllRecords(zone: string) {
    let page: RecordList | undefined;
    do {
      page = await this.listRecords(zone, page?.meta.links.next);
      yield* page.records;
    } while (page.meta.links.next);
  }

  createRecord(zone: string, record: DnsRecordData): Promise<DnsRecord> {
    if (!zone) throw new Error(`Zone is required`);
    if (!record) throw new Error(`Record is required`);
    return this._doHttp(`/v2/domains/${zone}/records`, {
      method: 'POST',
      body: JSON.stringify(record),
      headers: {
        'content-type': 'application/json',
      }});
  }

  async updateRecord(zone: string, recordId: string, changes: Partial<Omit<DnsRecordData, "type">>): Promise<void> {
    if (!zone) throw new Error(`Zone is required`);
    if (!recordId) throw new Error(`Record ID is required`);
    if (!changes) throw new Error(`Record changes are required`);
    await this._doHttp(`/v2/domains/${zone}/records/${recordId}`, {
      method: 'PATCH',
      body: JSON.stringify(changes),
      headers: {
        'content-type': 'application/json',
      }});
  }

  async deleteRecord(zone: string, recordId: string): Promise<void> {
    if (!zone) throw new Error(`Zone is required`);
    if (!recordId) throw new Error(`Record ID is required`);
    await this._doHttp(`/v2/domains/${zone}/records/${recordId}`, {
      method: 'DELETE',
    });
  }
}

interface DomainList {
  domains: Array<{
    domain: string;
    date_created: string;
  }>;
  meta: ListMeta;
};

interface DnsRecordData {
  type: string;
  name: string;
  data: string;
  priority?: number;
  ttl?: number;
}

interface DnsRecord extends DnsRecordData {
  id: string;
  priority: number;
  ttl: number;
}

interface RecordList {
  records: Array<DnsRecord>;
  meta: ListMeta;
}

interface ListMeta {
  total: number;
  links: {
    next: string, prev: string;
  };
}
