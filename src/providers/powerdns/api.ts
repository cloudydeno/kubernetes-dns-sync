import { log } from "../../deps.ts";

import { JsonClient } from "../json-client.ts";

export class PowerDnsApi extends JsonClient {

  #apiKey: string;
  constructor(
    endpoint: string,
    serverId: string,
  ) {
    super('powerdns', new URL(`v1/servers/${encodeURIComponent(serverId)}/`, endpoint));

    const apiKey = Deno.env.get('POWERDNS_API_KEY');
    if (!apiKey) throw new Error(`POWERDNS_API_KEY is required to use PowerDNS`);
    this.#apiKey = apiKey;
  }
  protected addAuthHeaders(headers: Headers) {
    headers.set('x-api-key', this.#apiKey);
  }

  async listAllZones() {
    return await this.doHttp<ZoneList>({ path: `zones` });
  }

  async getZone(zone: string) {
    if (!zone) throw new Error(`Zone is required`);
    return await this.doHttp<ZoneDetails>({ path: `zones/${zone}` });
  }

  async patchZoneRecords(zone: string, rrsets: DnsRecordSet[]) {
    if (!zone) throw new Error(`Zone is required`);
    if (!rrsets.length) throw new Error(`Record is required`);
    await this.doHttp({
      path: `zones/${zone}`,
      method: 'PATCH',
      jsonBody: { rrsets },
    });
  }

  async recreateEntireZone(zone: string) {
    await this.doHttp({
      path: `zones/${zone}.`,
      method: 'DELETE',
    }).catch(() => log.info(`Test zone ${zone} did not exist yet, so I couldn't delete it`));
    await this.doHttp({
      path: `zones`,
      method: 'POST',
      jsonBody: {name: `${zone}.`, kind: 'Native'},
    });
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
