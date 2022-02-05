import { JsonClient } from "../../lib/json-client.ts";

export interface CloudflareApiSurface {
  listAllZones(accountId?: string): AsyncGenerator<CloudflareZone>;
  listAllRecords(zoneId: string): AsyncGenerator<DnsRecord>;

  createRecord(zoneId: string,
    record: DnsRecordData,
  ): Promise<DnsRecord>;
  updateRecord(zoneId: string,
    recordId: string,
    changes: Partial<Omit<DnsRecordData, "type">>,
  ): Promise<DnsRecord>;
  deleteRecord(zoneId: string,
    recordId: string,
  ): Promise<{id: string}>;
}

function makeOpts(
  opts: PageOptions,
  extras: Record<string, string | undefined | null> = {},
) {
  const params = new URLSearchParams();
  if (opts.page) params.set('page', `${opts.page}`);
  if (opts.per_page) params.set('per_page', `${opts.per_page}`);
  if (opts.direction) params.set('direction', `${opts.direction}`);
  for (const [key, value] of Object.entries(extras)) {
    if (!value) continue;
    params.set(key, value);
  }
  return params;
}

export class CloudflareApi extends JsonClient implements CloudflareApiSurface {

  #apiKey: string;
  constructor() {
    super('cloudflare', `https://api.cloudflare.com/client/v4/`);

    const apiKey = Deno.env.get('CLOUDFLARE_TOKEN');
    if (!apiKey) throw new Error(`CLOUDFLARE_TOKEN is required to use Cloudflare`);
    this.#apiKey = apiKey;
  }
  protected addAuthHeaders(headers: Headers) {
    headers.set('authorization', `Bearer ${this.#apiKey}`);
  }

  listZones(opts: { accountId?: string } & PageOptions) {
    return this.doHttp<ListResponse<CloudflareZone>>({
      path: `zones`,
      query: makeOpts(opts, {
        'account.id': opts.accountId,
      }),
    });
  }
  async *listAllZones(accountId?: string) {
    let page = 1;
    while (true) {
      const data = await this.listZones({ accountId, page });
      yield* data.result;
      if (page++ >= data.result_info.total_pages) return;
    }
  }

  listRecords(opts: { zoneId: string } & PageOptions) {
    if (!opts.zoneId) throw new Error(`Zone is required`);
    return this.doHttp<ListResponse<DnsRecord>>({
      path: `zones/${opts.zoneId}/dns_records`,
      query: makeOpts(opts),
    });
  }
  async *listAllRecords(zoneId: string) {
    let page = 1;
    while (true) {
      const data = await this.listRecords({ zoneId, page });
      yield* data.result;
      if (page++ >= data.result_info.total_pages) return;
    }
  }

  async createRecord(zoneId: string, record: DnsRecordData) {
    if (!zoneId) throw new Error(`Zone ID is required`);
    if (!record) throw new Error(`Record is required`);
    const resp = await this.doHttp<Response<DnsRecord>>({
      path: `zones/${zoneId}/dns_records`,
      method: 'POST',
      body: JSON.stringify(record),
      headers: {
        'content-type': 'application/json',
      }});
    return resp.result;
  }

  async updateRecord(zoneId: string, recordId: string, changes: Partial<Omit<DnsRecordData, "type">>): Promise<DnsRecord> {
    if (!zoneId) throw new Error(`Zone ID is required`);
    if (!recordId) throw new Error(`Record ID is required`);
    if (!changes) throw new Error(`Record changes are required`);
    const resp = await this.doHttp<Response<DnsRecord>>({
      path: `zones/${zoneId}/dns_records/${recordId}`,
      method: 'PATCH',
      body: JSON.stringify(changes),
      headers: {
        'content-type': 'application/json',
      }});
    return resp.result;
  }

  async deleteRecord(zoneId: string, recordId: string) {
    if (!zoneId) throw new Error(`Zone ID is required`);
    if (!recordId) throw new Error(`Record ID is required`);
    const resp = await this.doHttp<Response<{id: string}>>({
      path: `zones/${zoneId}/dns_records/${recordId}`,
      method: 'DELETE',
    });
    return resp.result;
  }
}

export interface CloudflareZone {
  id: string;
  name: string;
  created_on: string;
  modified_on: string;
  status: 'active' | 'pending' | 'initializing' | 'moved' | 'deleted' | 'deactivated';
};

// https://api.cloudflare.com/#dns-records-for-a-zone-create-dns-record
export interface DnsRecordData {
  type: 'A' | 'AAAA' | 'CNAME' | 'HTTPS' | 'TXT' | 'SRV' | 'LOC' | 'MX' | 'NS' | 'CERT' | 'DNSKEY' | 'DS' | 'NAPTR' | 'SMIMEA' | 'SSHFP' | 'SVCB' | 'TLSA' | 'URI';
  name: string;
  content: string;
  ttl: number; // Must be between 60 and 86400, or 1 for 'automatic'

  priority?: number; // for MX, SRV and URI
  proxied?: boolean;
}

export interface DnsRecord extends DnsRecordData {
  id: string;
  zone_id: string;
  zone_name: string;

  proxiable: boolean;
  proxied: boolean;
  // data: {};
  locked: boolean;
  created_on: string;
  modified_on: string;
  meta: Record<string, unknown>;
}

export type Response<T> = {
  success: boolean; // TODO: do deletions have this?
  errors?: Array<unknown>;
  messages?: Array<unknown>;
  result: T;
};

interface PageOptions {
  page?: number;
  per_page?: number;
  direction?: "asc" | "desc";
}
interface PageResult {
  page: number;
  per_page: number;
  total_pages: number;
  count: number;
  total_count: number;
}
export type ListResponse<T> = Response<Array<T>> & {
  result_info: PageResult;
};
