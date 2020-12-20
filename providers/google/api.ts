import { ServiceAccount } from "./api-auth.ts";

export class GoogleCloudDnsApi {

  constructor(accessMode: 'readwrite' | 'readonly', noRefresh: boolean) {
    const credPath = Deno.env.get('GOOGLE_APPLICATION_CREDENTIALS');
    if (!credPath) throw new Error(`GOOGLE_APPLICATION_CREDENTIALS is required to use Google`);
    this.#svcAccount = ServiceAccount.readFromFile(credPath);
    this.accessScope = `https://www.googleapis.com/auth/ndev.clouddns.${accessMode}`;
    this.noRefresh = noRefresh;
  }
  #svcAccount: ServiceAccount;
  accessScope: string;
  noRefresh: boolean;

  get projectId() {
    if (!this.#svcAccount.projectId) throw new Error(
      `Google Cloud 'project_id' not found in service account key`);
    return this.#svcAccount.projectId;
  }

  #cachedToken: string | null = null;
  async getAccessToken() {
    if (this.#cachedToken) return this.#cachedToken;
    // Fetch fresh token
    const newToken = await this.#svcAccount.issueToken(this.accessScope);
    // Cache for a limited time. Don't auto renew, will happen next request
    this.#cachedToken = newToken.access_token;
    const expireAfterMillis = Math.floor(newToken.expires_in * 0.95 * 1000);
    if (!this.noRefresh) setTimeout(() => {
      if (this.#cachedToken === newToken.access_token) {
        this.#cachedToken = null;
      }
    }, Math.max(60 * 1000, expireAfterMillis));
    return newToken.access_token;
  }

  async _doHttp(path: string, opts?: RequestInit & {query?: URLSearchParams}) {
    if (opts?.query?.toString()) {
      path += (path.includes('?') ? '&' : '?') + opts.query.toString();
    }
    const headers = new Headers(opts?.headers);
    headers.set('authorization', `Bearer ${await this.getAccessToken()}`);
    headers.set('accept', `application/json`);
    const resp = await fetch(new URL(path, `https://dns.googleapis.com/dns/v1/`), {
      ...opts,
      headers,
    });
    console.error('   ', opts?.method ?? 'GET', 'google', path, resp.status);
    if (resp.status == 204) {
      resp.text();
      return null;
    } else if (resp.status >= 400) {
      const text = await resp.text();
      throw new Error(`Google HTTP ${resp.status} ${resp.statusText}: ${text}`);
    }
    return await resp.json();
  }

  listZones(projectId: string, pageToken?: string | null): Promise<Schema$ManagedZonesListResponse> {
    if (!projectId) throw new Error(`Project is required`);
    const query = new URLSearchParams;
    if (pageToken) query.set('pageToken', pageToken);
    return this._doHttp(`projects/${projectId}/managedZones`, {query});
  }
  async *listAllZones(projectId: string) {
    let page: Schema$ManagedZonesListResponse | undefined;
    do {
      page = await this.listZones(projectId, page?.nextPageToken);
      if (page.managedZones) yield* page.managedZones;
    } while (page.nextPageToken);
  }

  listRecords(projectId: string, zoneId: string, pageToken?: string | null): Promise<Schema$ResourceRecordSetsListResponse> {
    if (!projectId) throw new Error(`Project is required`);
    if (!zoneId) throw new Error(`Zone is required`);
    const query = new URLSearchParams;
    if (pageToken) query.set('pageToken', pageToken);
    return this._doHttp(`projects/${projectId}/managedZones/${zoneId}/rrsets`, {query});
  }
  async *listAllRecords(projectId: string, zoneId: string) {
    let page: Schema$ResourceRecordSetsListResponse | undefined;
    do {
      page = await this.listRecords(projectId, zoneId, page?.nextPageToken);
      if (page.rrsets) yield* page.rrsets;
    } while (page.nextPageToken);
  }

  submitChange(projectId: string, zoneId: string, changes: Schema$Change): Promise<Schema$Change> {
    if (!projectId) throw new Error(`Project is required`);
    if (!zoneId) throw new Error(`Zone is required`);
    if (!changes) throw new Error(`Changes are required`);
    return this._doHttp(`projects/${projectId}/managedZones/${zoneId}/changes`, {
      method: 'POST',
      body: JSON.stringify(changes),
      headers: {
        'content-type': 'application/json',
      }});
  }

  getChange(projectId: string, zoneId: string, changeId: string): Promise<Schema$Change> {
    if (!projectId) throw new Error(`Project is required`);
    if (!zoneId) throw new Error(`Zone is required`);
    if (!changeId) throw new Error(`Change is required`);
    return this._doHttp(`projects/${projectId}/managedZones/${zoneId}/changes/${changeId}`);
  }

//   async updateRecord(zone: string, recordId: string, changes: Partial<Omit<DnsRecordData, "type">>): Promise<void> {
//     if (!zone) throw new Error(`Zone is required`);
//     if (!recordId) throw new Error(`Record ID is required`);
//     if (!changes) throw new Error(`Record changes are required`);
//     await this._doHttp(`/v2/domains/${zone}/records/${recordId}`, {
//       method: 'PATCH',
//       body: JSON.stringify(changes),
//       headers: {
//         'content-type': 'application/json',
//       }});
//   }

//   async deleteRecord(zone: string, recordId: string): Promise<void> {
//     if (!zone) throw new Error(`Zone is required`);
//     if (!recordId) throw new Error(`Record ID is required`);
//     await this._doHttp(`/v2/domains/${zone}/records/${recordId}`, {
//       method: 'DELETE',
//     });
//   }
}


// schemas via https://github.com/googleapis/google-api-nodejs-client/blob/master/src/apis/dns/v1.ts

export interface Schema$ManagedZonesListResponse {
  kind: "dns#managedZonesListResponse";
  header?: Schema$ResponseHeader;
  managedZones?: Schema$ManagedZone[];
  nextPageToken?: string | null;
}
export interface Schema$ManagedZone {
  kind: "dns#managedZone";
  creationTime?: string | null;
  description?: string | null;
  dnsName?: string | null;
  dnssecConfig?: Schema$ManagedZoneDnsSecConfig;
  forwardingConfig?: unknown;
  id?: string | null;
  labels?: {[key: string]: string} | null;
  name?: string | null;
  nameServers?: string[] | null;
  nameServerSet?: string | null;
  peeringConfig?: unknown;
  privateVisibilityConfig?: unknown;
  reverseLookupConfig?: unknown;
  visibility?: string | null;
}
export interface Schema$ManagedZoneDnsSecConfig {
  kind: "dns#managedZoneDnsSecConfig";
  defaultKeySpecs?: Schema$DnsKeySpec[];
  nonExistence?: string | null;
  state?: string | null;
}
export interface Schema$DnsKeySpec {
  kind: "dns#dnsKeySpec";
  algorithm?: string | null;
  keyLength?: number | null;
  keyType?: string | null;
}

export interface Schema$ResourceRecordSetsListResponse {
  kind: "dns#resourceRecordSetsListResponse";
  header?: Schema$ResponseHeader;
  nextPageToken?: string | null;
  rrsets?: Schema$ResourceRecordSet[];
}
export interface Schema$ResourceRecordSet {
  kind?: "dns#resourceRecordSet";
  name?: string | null;
  routingPolicy?: unknown; // TODO, probably..
  rrdatas?: string[] | null;
  signatureRrdatas?: string[] | null;
  ttl?: number | null;
  type?: string | null;
}

export interface Schema$Change {
  kind: "dns#change";
  additions?: Schema$ResourceRecordSet[];
  deletions?: Schema$ResourceRecordSet[];
  id?: string | null;
  isServing?: boolean | null;
  startTime?: string | null;
  status?: string | null;
}

export interface Schema$ResponseHeader {
  /**
    * For mutating operation requests that completed successfully. This is the client_operation_id if the client specified it, otherwise it is generated by the server (output only).
    */
  operationId?: string | null;
}
