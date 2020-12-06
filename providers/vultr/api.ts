export class VultrApi {

  #apiKey: string;
  constructor() {
    const apiKey = Deno.env.get('VULTR_API_KEY');
    if (!apiKey) throw new Error(`VULTR_API_KEY is required to use Vultr`);
    this.#apiKey = apiKey;
  }

  _doHttp(path: string, opts?: RequestInit & {query: URLSearchParams}) {
    if (opts?.query.toString()) {
      path += (path.includes('?') ? '&' : '?') + opts.query.toString();
    }
    const headers = new Headers(opts?.headers);
    headers.set('authorization', `Bearer ${this.#apiKey}`);
    headers.set('accept', `application/json`);
    console.log(opts?.method ?? 'GET', 'vultr', path);
    return fetch(new URL(path, `https://api.vultr.com`), {
      ...opts,
      headers,
    }).then(x => x.json());
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

}

interface DomainList {
  domains: Array<{
    domain: string;
    date_created: string;
  }>;
  meta: ListMeta;
};

interface RecordList {
  records: Array<{
    id: string;
    type: string;
    name: string;
    data: string;
    priority: number;
    ttl: number;
  }>;
  meta: ListMeta;
}

interface ListMeta {
  total: number;
  links: {
    next: string, prev: string;
  };
}
