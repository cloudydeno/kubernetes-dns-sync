import {
  NoopRegistryConfig,
  DnsRegistry, DnsRegistryContext,
  Zone, Changes, Endpoint,
} from "../common/mod.ts";

/** Does absolutely nothing about record ownership. */
export class NoopRegistry implements DnsRegistry<NoopRegistryContext> {

  constructor(public config: NoopRegistryConfig) {}

  NewContext(zones: Zone[]) {
    return new NoopRegistryContext(this);
  }
}

class NoopRegistryContext implements DnsRegistryContext {
  constructor(private registry: NoopRegistry) {}

  RecognizeLabels(raw: Endpoint[]): Promise<Endpoint[]> {
    return Promise.resolve(raw);
  }

  CommitLabels(changes: Changes): Promise<Changes> {
    return Promise.resolve(changes);
  }

}
