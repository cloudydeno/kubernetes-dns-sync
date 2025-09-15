import { ServiceAccount, ServiceAccountApi } from "../../deps.ts";
import { JsonClient } from "../../lib/json-client.ts";

export class GoogleCloudDnsApi extends JsonClient {

  constructor(accessMode: 'readwrite' | 'readonly', noRefresh: boolean) {
    super('google', `https://dns.googleapis.com/dns/v1/`);

    const credPath = Deno.env.get('GOOGLE_APPLICATION_CREDENTIALS');
    if (!credPath) throw new Error(`GOOGLE_APPLICATION_CREDENTIALS is required to use Google`);
    this.#svcAccount = ServiceAccount.readFromFileSync(credPath);
    this.accessScope = `https://www.googleapis.com/auth/ndev.clouddns.${accessMode}`;
    this.noRefresh = noRefresh;
  }
  #svcAccount: ServiceAccountApi;
  accessScope: string;
  noRefresh: boolean;

  async getProjectId(): Promise<string> {
    const projectId = await this.#svcAccount.getProjectId();
    if (!projectId) throw new Error(
      `Google Cloud 'project_id' not found in service account key`);
    return projectId;
  }

  #cachedToken: string | null = null;
  async getAccessToken() {
    if (this.#cachedToken) return this.#cachedToken;
    // Fetch fresh token
    const newToken = await this.#svcAccount.issueToken(this.accessScope.split(' '));
    // Cache for a limited time. Don't auto renew, will happen next request
    this.#cachedToken = newToken.accessToken;
    const expireAfterMillis = Math.floor((newToken.expiresAt.valueOf() - Date.now()) * 0.95);
    if (!this.noRefresh) setTimeout(() => {
      if (this.#cachedToken === newToken.accessToken) {
        this.#cachedToken = null;
      }
    }, Math.max(60 * 1000, expireAfterMillis));
    return newToken.accessToken;
  }
  protected async addAuthHeaders(headers: Headers) {
    headers.set('authorization', `Bearer ${await this.getAccessToken()}`);
  }

  listZones(projectId: string, pageToken?: string | null) {
    if (!projectId) throw new Error(`Project is required`);
    const query = new URLSearchParams;
    if (pageToken) query.set('pageToken', pageToken);
    return this.doHttp<Schema$ManagedZonesListResponse>({
      path: `projects/${projectId}/managedZones`,
      query,
    });
  }
  async *listAllZones(projectId: string) {
    let page: Schema$ManagedZonesListResponse | undefined;
    do {
      page = await this.listZones(projectId, page?.nextPageToken);
      if (page.managedZones) yield* page.managedZones;
    } while (page.nextPageToken);
  }

  listRecords(projectId: string, zoneId: string, pageToken?: string | null) {
    if (!projectId) throw new Error(`Project is required`);
    if (!zoneId) throw new Error(`Zone is required`);
    const query = new URLSearchParams;
    if (pageToken) query.set('pageToken', pageToken);
    return this.doHttp<Schema$ResourceRecordSetsListResponse>({
      path: `projects/${projectId}/managedZones/${zoneId}/rrsets`,
      query,
    });
  }
  async *listAllRecords(projectId: string, zoneId: string) {
    let page: Schema$ResourceRecordSetsListResponse | undefined;
    do {
      page = await this.listRecords(projectId, zoneId, page?.nextPageToken);
      if (page.rrsets) yield* page.rrsets;
    } while (page.nextPageToken);
  }

  submitChange(projectId: string, zoneId: string, changes: Schema$Change) {
    if (!projectId) throw new Error(`Project is required`);
    if (!zoneId) throw new Error(`Zone is required`);
    if (!changes) throw new Error(`Changes are required`);
    changes.kind ??= "dns#change";
    return this.doHttp<Schema$Change>({
      path: `projects/${projectId}/managedZones/${zoneId}/changes`,
      method: 'POST',
      jsonBody: changes,
    });
  }

  getChange(projectId: string, zoneId: string, changeId: string) {
    if (!projectId) throw new Error(`Project is required`);
    if (!zoneId) throw new Error(`Zone is required`);
    if (!changeId) throw new Error(`Change is required`);
    return this.doHttp<Schema$Change>({
      path: `projects/${projectId}/managedZones/${zoneId}/changes/${changeId}`,
    });
  }
}


// https://cloud.google.com/dns/docs/records-overview#supported_dns_record_types
type supportedRecordTypes =
  | 'A'
  | 'AAAA'
  | 'CAA'
  | 'CNAME'
  | 'DNSKEY'
  | 'DS'
  | 'HTTPS'
  | 'IPSECKEY'
  | 'MX'
  | 'NAPTR'
  | 'NS'
  | 'PTR'
  | 'SOA'
  | 'SPF'
  | 'SRV'
  | 'SSHFP'
  | 'SVCB'
  | 'TLSA'
  | 'TXT'
;

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
  type?: supportedRecordTypes | null;
}

export interface Schema$Change {
  kind?: "dns#change";
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
