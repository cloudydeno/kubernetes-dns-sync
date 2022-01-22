import { NoopRegistryConfig } from "../common/config.ts";
import { BaseRecord, DnsRegistry, ZoneState, SourceRecord } from "../common/contract.ts";

const ZoneCriticalTypes = new Set(['SOA', 'NS']);

/**
 * Does absolutely nothing about record ownership.
 * All discovered records are treated as ours, and we are willing to modify any FQDN.
 *
 * You probably want to look at the first plan before letting this make first changes!
 *
 * NOOP EXCEPTION: SOA/NS records at the root are left alone.
 * If you want to manage root SOA/NS without a TXT registry, file an issue.
 */
export class NoopRegistry<T extends BaseRecord> implements DnsRegistry<T> {

  constructor(public readonly config: NoopRegistryConfig) {}

  ApplyDesiredRecords(state: ZoneState<T>, desiredBySources: Array<SourceRecord>, enricher: (record: SourceRecord) => T | null) {

    // Just pass thru whatever
    state.Desired = Array.from(desiredBySources)
      .map(enricher)
      .flatMap(x => x ? [x] : []);

    // Also copy in any zone-critical root records
    for (const record of state.Existing) {
      if (record.dns.fqdn == state.Zone.fqdn) {
        if (ZoneCriticalTypes.has(record.dns.type)) {
          state.Desired.push(record);
        }
      }
    }

    // That's it!
  }

}
