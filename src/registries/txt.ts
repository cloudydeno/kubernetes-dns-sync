import { log } from "../deps.ts";

import type { TxtRegistryConfig } from "../defs/config.ts";
import type { DnsRegistry, ZoneState, BaseRecord, SourceRecord } from "../defs/types.ts";

/** Manages record ownership in-band with regular TXT records */
export class TxtRegistry<Tinput extends BaseRecord> implements DnsRegistry<Tinput> {
  config: Required<TxtRegistryConfig>;
  constructor(config: TxtRegistryConfig) {
    this.config = {
      txt_prefix: '',
      txt_suffix: '',
      auto_adopt_from_owner_ids: [],
      ...config,
    };
    if (config.txt_suffix) throw new Error(`TODO: txt_suffix's - where do they go?`);
  }


  ApplyDesiredRecords(state: ZoneState<Tinput>, desiredBySources: Array<SourceRecord>, enricher: (record: SourceRecord) => Tinput | null) {
    if (state.Desired) throw new Error(`zone State already has Desired record list`);

    const ownershipRecords = state
      .Existing.flatMap(record => {
        if (record.dns.type !== 'TXT') return [];
        if (!record.dns.content.startsWith(`heritage=`)) return [];
        if (!record.dns.fqdn.startsWith(this.config.txt_prefix)) return [];

        const labels = parseLabels(record.dns.content);
        const heritageMatches = ['external-dns', 'dns-sync'].includes(labels['heritage']);
        return [{
          record, labels,
          targetFqdn: record.dns.fqdn.slice(this.config.txt_prefix.length),
          isOurs: heritageMatches && labels['external-dns/owner'] === this.config.txt_owner_id,
          isAdoptable: heritageMatches && this.config.auto_adopt_from_owner_ids.includes(labels['external-dns/owner']),
          targetTypes: new Set(Object.keys(labels).filter(x => x.startsWith('record-type/')).map(x => x.split('/')[1])),
        }];
      });
    const ownershipRecordMap = new Map(ownershipRecords.map(x => [x.record, x]));
    // const normalRecords = state.Existing.filter(x => !ownershipRecordSet.has(x));

    const stateDesired = new Set<Tinput>();

    // DESIRED AS-IS: Any existing registry records that are not ours
    for (const ownership of ownershipRecords) {
      if (!ownership.isOurs) {
        stateDesired.add(ownership.record);
      }
    }

    // DESIRED AS-iS: The desired records from our sources
    //   - as long as we have or can establish ownership!
    // DESIRED FRESH: Calculate our own registry records

    // Figure out what we're comfortable managing
    const relevantFqdns = new Set(desiredBySources.map(x => x.dns.fqdn));
    for (const ownership of ownershipRecords) {
      if (!ownership.isOurs) continue;
      relevantFqdns.add(ownership.targetFqdn);
    }

    const managedByUs = new Set<string>();

    for (const fqdn of relevantFqdns) {
      const ourRecords = desiredBySources.filter(x => x.dns.fqdn == fqdn);
      const existingOwnerships = ownershipRecords.filter(x => x.targetFqdn == fqdn);

      const desiredTypes = new Set<string>(ourRecords.map(x => x.dns.type).sort());
      const allowedTypes = new Set<string>();
      // const unregisteredTypes = new Set<string>();

      // Check what we already have registered - is it enough?
      const ourOwnership = existingOwnerships.find(x => x.isOurs);
      let areWeAdopting = false;
      if (ourOwnership) {
        // We have an ownership already
        // Make sure we pay attention to everything we're supposedly managing:
        for (const type of ourOwnership.targetTypes) {
          allowedTypes.add(type);
        }
        if (ourOwnership.targetTypes.size === 0) {
          // If the ownership is being upgraded then let's fill in sane types
          // The ones we don't care about will be removed
          allowedTypes.add('A');
          allowedTypes.add('AAAA');
          allowedTypes.add('CNAME');
        }
        // We'll also update the registration with specific types if needed.

        // Then check if we need to add anything else:
        for (const missingType of desiredTypes.difference(allowedTypes)) {
          // If we want something but records already exist, leave that type alone
          for (const existingRecord of state.Existing) {
            if (existingRecord.dns.type !== missingType) continue;
            if (existingRecord.dns.fqdn !== fqdn) continue;
            if (ownershipRecordMap.has(existingRecord)) continue;
            allowedTypes.delete(existingRecord.dns.type);
          }
        }

      } else {
        // Let's start by trying to own everything we would like
        for (const type of desiredTypes) {
          allowedTypes.add(type);
        }

        // Check what is managed already
        for (const ownership of existingOwnerships) {
          if (ownership.targetTypes.size > 0) {
            for (const takenType of ownership.targetTypes) {
              if (!desiredTypes.has(takenType)) continue;

              if (ownership.isAdoptable) {
                // TODO: any further safety checks on adoption?
                log.warn(`WARN: adopting FQDN ${fqdn} from ${ownership.labels['external-dns/owner']}`);
                stateDesired.delete(ownership.record); // Delete the other ownership record
                areWeAdopting = true;
                break; // This ownership record does not need further consideration

              } else {
                allowedTypes.delete(takenType);
              }
            }
          } else {
            if (ownership.isAdoptable) {
              // TODO: any further safety checks on adoption?
              log.warn(`WARN: adopting FQDN ${fqdn} from ${ownership.labels['external-dns/owner']}`);
              stateDesired.delete(ownership.record); // Delete the other ownership record
              areWeAdopting = true;

            } else {
              log.debug(`Found unscoped registration for FQDN ${fqdn} (made by external-dns?) which means we can't do anything there.`);
              allowedTypes.clear();
            }
          }
        }
        // Also check what things exist already
        for (const existingRecord of state.Existing) {
          if (existingRecord.dns.fqdn !== fqdn) continue;
          if (ownershipRecordMap.has(existingRecord)) continue;
          if (areWeAdopting) continue; // TODO: partial adoption could be a thing!
          allowedTypes.delete(existingRecord.dns.type);
        }
        // throw new Error(`TODO: we are not registered for this FQDN yet`);
      }

      for (const type of allowedTypes) {
        managedByUs.add(JSON.stringify([fqdn, type]));
      }

      // We are cleared to add some stuff

      const resourceKeys = new Set<string>();
      for (const desiredRec of ourRecords) {
        if (allowedTypes.has(desiredRec.dns.type)) {
          // resourceKeys.add(desiredRec.)
          const transformed = enricher(desiredRec);
          if (transformed) {
            stateDesired.add(transformed);
            resourceKeys.add(desiredRec.resourceKey);
          }
        } else {
          log.warn(`Skipping ${desiredRec.dns.fqdn}/${desiredRec.dns.type} due to TXT registry overlap`);
        }
      }

      const labels: Record<string,string> = {
        'heritage': 'external-dns',
        'external-dns/owner': this.config.txt_owner_id,
      };
      if (resourceKeys.size == 1) {
        labels['external-dns/resource'] = Array.from(resourceKeys)[0];
      }
      const managedTypes = desiredTypes.intersection(allowedTypes);
      for (const type of managedTypes) {
        if (!desiredTypes.has(type)) continue;
        labels[`record-type/${type}`] = 'managed';
      }
      if (managedTypes.size > 0) {
        const ownerRec = enricher({
          annotations: {},
          resourceKey: 'txt-registry',
          dns: {
            fqdn: `${this.config.txt_prefix}${fqdn}`,
            type: 'TXT',
            content: Object.entries(labels).map(x => x.join('=')).join(','),
          },
        });
        if (!ownerRec) throw new Error(`BUG: didn't get ownership record enriched`);
        stateDesired.add(ownerRec);
      }
    }

    // DESIRED AS-IS: existing records that aren't registry or in one of our spots
    for (const existing of state.Existing) {
      if (ownershipRecordMap.has(existing)) continue;
      if (managedByUs.has(JSON.stringify([existing.dns.fqdn, existing.dns.type]))) continue;
      stateDesired.add(existing);
    }

    // TODO: return some stats:
    // # of existing record targets from us
    // # of skipped records (not cleared to add)

    state.Desired = Array.from(stateDesired);
  }

}

function parseLabels(raw: string): Record<string,string> {
  const labels: Record<string,string> = Object.create(null);
  for (const part of raw.split(',')) {
    const [key, val] = part.split('=');
    labels[key] = val;
  }
  return labels;
}
