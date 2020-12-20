import * as JWT from "https://deno.land/x/djwt@v2.0/mod.ts";

export class ServiceAccount {
  constructor(
    private credential: ServiceAccountCredential,
  ) {}
  #privateKey = this.credential.private_key;

  get projectId() {
    return this.credential.project_id;
  }

  static readFromFile(path: string): ServiceAccount {
    const rawFile = Deno.readTextFileSync(path);
    if (rawFile[0] !== '{') throw new Error(
      `The file at ${JSON.stringify(path)} doesn't look like a JSON document`);

    const accountInfo: ServiceAccountCredential = JSON.parse(rawFile);
    if (accountInfo.type !== 'service_account') throw new Error(
      `The file at ${JSON.stringify(path)} doesn't look like a service_account`);

    return new ServiceAccount(accountInfo);
  }

  async issueToken(scope: string): Promise<TokenResponse> {
    const jwt = await JWT.create({
      alg: "RS256", typ: "JWT",
    }, {
      "iss": this.credential.client_email,
      "scope": scope,
      "aud": this.credential.token_uri,
      "exp": JWT.getNumericDate(60 * 60),
      "iat": JWT.getNumericDate(0),
    }, this.#privateKey.trim());

    const payload = new FormData();
    payload.append("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
    payload.append("assertion", jwt);

    const resp = await fetch(this.credential.token_uri, {
      method: 'POST',
      body: payload,
    })
    return await resp.json();
  }

  selfSignToken(audience: string): Promise<string> {
    return JWT.create({
      alg: "RS256", typ: "JWT",
      kid: this.credential.private_key_id,
    }, {
      "iss": this.credential.client_email,
      "sub": this.credential.client_email,
      "aud": audience,
      "exp": JWT.getNumericDate(60 * 60),
      "iat": JWT.getNumericDate(0),
    }, this.#privateKey.trim());
  }
}

export interface ServiceAccountCredential {
  "type": "service_account";

  "project_id": string;
  "private_key_id": string;
  "private_key": string;
  "client_email": string;
  "client_id": string;

  "auth_uri": "https://accounts.google.com/o/oauth2/auth";
  "token_uri": "https://oauth2.googleapis.com/token";
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs";
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firestore-maintenance%40stardust-skychat.iam.gserviceaccount.com";
};

export interface TokenResponse {
  "access_token": string;
  "scope"?: string;
  "token_type": "Bearer";
  "expires_in": number;
};
