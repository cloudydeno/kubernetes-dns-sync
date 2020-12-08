import {
  GoogleProviderConfig,
  DnsProvider, DnsProviderContext,
  Zone, Endpoint, Changes,
} from "../../common/mod.ts";

export class GoogleProvider implements DnsProvider<GoogleProviderContext> {

  constructor(public config: GoogleProviderConfig) {
  }

  async NewContext(): Promise<GoogleProviderContext> {
    return new GoogleProviderContext();
  }
}

export class GoogleProviderContext implements DnsProviderContext {

  Zones = new Array<Zone>();

  Records(): Promise<Endpoint[]> {
    throw new Error("Method not implemented.");
  }

  ApplyChanges(changes: Changes): Promise<void> {
    throw new Error("Method not implemented.");
  }

}
