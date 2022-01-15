export class PowerDnsApi {

  #apiKey: string;
  #apiBase: URL;
  constructor(
    endpoint: string,
    serverId: string,
  ) {
    const apiKey = Deno.env.get('POWERDNS_API_KEY');
    if (!apiKey) throw new Error(`POWERDNS_API_KEY is required to use PowerDNS`);
    this.#apiKey = apiKey;

    this.#apiBase = new URL(
      `v1/servers/${encodeURIComponent(serverId)}/`, endpoint);
  }

  async _doHttp(path: string, opts?: RequestInit & {query?: URLSearchParams}) {
    if (opts?.query?.toString()) {
      path += (path.includes('?') ? '&' : '?') + opts.query.toString();
    }
    const headers = new Headers(opts?.headers);
    headers.set('x-api-key', this.#apiKey);
    headers.set('accept', `application/json`);
    const resp = await fetch(new URL(path, this.#apiBase), {
      ...opts,
      headers,
    });
    console.error('   ', opts?.method ?? 'GET', 'powerdns', new URL(path, this.#apiBase).pathname, resp.status);
    if (resp.status == 204) {
      resp.text();
      return null;
    } else if (resp.status >= 400) {
      const text = await resp.text();
      throw new Error(`PowerDNS HTTP ${resp.status} ${resp.statusText}: ${text}`);
    }
    return await resp.json();
  }

  async listAllZones(): Promise<ZoneList> {
    return await this._doHttp(`zones`);
  }

  async getZone(zone: string): Promise<ZoneDetails> {
    if (!zone) throw new Error(`Zone is required`);
    return await this._doHttp(`zones/${zone}`);
  }

  async patchZoneRecords(zone: string, rrsets: DnsRecordSet[]): Promise<void> {
    if (!zone) throw new Error(`Zone is required`);
    if (!rrsets.length) throw new Error(`Record is required`);
    return await this._doHttp(`zones/${zone}`, {
      method: 'PATCH',
      body: JSON.stringify({ rrsets }),
      headers: {
        'content-type': 'application/json',
      }});
  }
}

export interface ZoneListEntry {
  dnssec: boolean;
  edited_serial: number;
  id: string;
  kind: "Native" | "Slave" | "Master";
  last_check: number;
  masters: unknown[];
  name: string;
  notified_serial?: number;
  serial?: number;
  url: string;
}[];
export type ZoneList = Array<ZoneListEntry>;
export type ZoneDetails = ZoneListEntry & {
  api_rectify: boolean;
  master_tsig_key_ids: Array<string>;
  slave_tsig_key_ids: Array<string>;
  nsec3narrow: boolean;
  nsec3param: string;
  rrsets: DnsRecordSet[];
  soa_edit: string;
  soa_edit_api: string;
};

export interface DnsRecordSet {
  name: string;
  type: string;
  records: Array<DnsRecordData>;
  comments: Array<DnsComment>;
  ttl?: number;
  priority?: number;
  changetype?: "REPLACE" | "DELETE";
}
export interface DnsRecordData {
  content: string;
  disabled: boolean;
}
export interface DnsComment {
  content: string;
  account?: string;
  modified_at?: number;
}
