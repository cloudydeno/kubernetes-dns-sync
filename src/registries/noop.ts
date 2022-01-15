import {
  NoopRegistryConfig,
  DnsRegistry,
  BaseRecord, ZoneState,
} from "../common/mod.ts";

/**
 * Does absolutely nothing about record ownership.
 * All discovered records are treated as ours, and we are willing to modify any FQDN.
 * EXCEPTION: SOA/NS records at the root are ignored.
 * If you want to manage root SOA/NS without a TXT registry, file an issue.
 */
export class NoopRegistry<T extends BaseRecord> implements DnsRegistry<T,T> {

  constructor(public config: NoopRegistryConfig) {}

  RecognizeLabels(provider: ZoneState<T>): Promise<ZoneState<T>> {
    return Promise.resolve({
      Zone: provider.Zone,
      Existing: provider.Existing.filter(x =>
        !(x.dns.fqdn == provider.Zone.DNSName && ['SOA','NS'].includes(x.dns.type))),
      Desired: provider.Desired,
    });
  }

  CommitLabels(inner: ZoneState<T>): Promise<ZoneState<T>> {
    return Promise.resolve(inner);
  }

}
