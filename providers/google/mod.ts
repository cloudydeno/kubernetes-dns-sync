import { GoogleProviderConfig, Changes, DnsProvider, Endpoint } from "../../common/mod.ts";

export class GoogleProvider implements DnsProvider {

  constructor(public config: GoogleProviderConfig) {
  }

  Records(): Promise<Endpoint[]> {
    throw new Error("Method not implemented.");
  }

  ApplyChanges(changes: Changes): Promise<void> {
    throw new Error("Method not implemented.");
  }

}
