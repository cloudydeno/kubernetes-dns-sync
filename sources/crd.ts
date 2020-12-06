import { CrdSourceConfig, DnsSource, Endpoint } from "../common/mod.ts";

export class CrdSource implements DnsSource {

  constructor(public config: CrdSourceConfig) {
  }

  Endpoints(): Promise<Endpoint[]> {
    throw new Error("Method not implemented.");
  }

  AddEventHandler(cb: () => void): void {
    throw new Error("Method not implemented.");
  }

}
