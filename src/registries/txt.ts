// import {
//   TxtRegistryConfig,
//   DnsRegistry,
//   BaseRecord, ZoneState,
// } from "../common/mod.ts";

import { TxtRegistryConfig } from "../common/config.ts";
import { DnsRegistry, ZoneState, BaseRecord, SourceRecord } from "../common/contract.ts";


// type TxtRegistryRecord<T extends BaseRecord> = T & {
//   heritage: string;
//   owner: string;
//   recordTypes: string[];
// }

interface TxtRegistryState<T extends BaseRecord> extends ZoneState<T> {
  originalState: ZoneState<T>;
  ownershipRecords: {
    record: T;
    labels: Record<string, string>;
    targetFqdn: string;
    isOurs: boolean;
    isAdoptable: boolean;
    targetTypes: Set<string>;
  }[];
}

/** Manages record ownership in-band with regular TXT records */
export class TxtRegistry<Tinput extends BaseRecord> implements DnsRegistry<Tinput,Tinput> {
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

  // RecognizeLabels(provider: ZoneState<T>): Promise<ZoneState<T>> {
  RecognizeLabels(fromProvider: ZoneState<Tinput>): Promise<TxtRegistryState<Tinput>> {

    const ownershipRecords = fromProvider
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
    const ownershipRecordSet = new Set(ownershipRecords.map(x => x.record));
    const normalRecords = fromProvider.Existing.filter(x => !ownershipRecordSet.has(x));

    const ourTargets = ownershipRecords.filter(x => x.isOurs);
    const ourRecords = normalRecords.filter(x => ourTargets.find(y => {
      if (x.dns.fqdn !== y.targetFqdn) return false;
      if (y.targetTypes.size == 0) return true;
      return y.targetTypes.has(x.dns.type);
    }));

    console.log('our records:', ourRecords);
    // Deno.exit(4);

    const newState: TxtRegistryState<Tinput> = {
      Zone: fromProvider.Zone,
      Existing: ourRecords, // fromProvider.Existing,
      // Desired: fromProvider.Desired,
      ownershipRecords,
      originalState: fromProvider,
    };
    return Promise.resolve(newState);
  }

  CommitLabels(inner: TxtRegistryState<Tinput>, enricher: (record: SourceRecord) => Tinput | null): Promise<ZoneState<Tinput>> {
    // const existing = new Array(inner.Existing);
    // for (const ownerRec of inner.ownershipRecords) {
    //   existing.push(ownerRec.record);
    // }


    const relevantCoords = new Set<string>();
    for (const existing of inner.Existing) {
      relevantCoords.add(JSON.stringify([existing.dns.fqdn, existing.dns.type]));
    }
    for (const existing of inner.Desired ?? []) {
      relevantCoords.add(JSON.stringify([existing.dns.fqdn, existing.dns.type]));
    }

    if (!inner.Desired) throw new Error(`need Desired to plan txt registry`);

    // const existing = new Array<Tinput>();
    const desired = Array.from(inner.Desired);

    console.log('Relevant coords:', relevantCoords);
    for (const coord of relevantCoords) {
      const [fqdn, type] = JSON.parse(coord) as string[];
      const ownership = inner.ownershipRecords.find(x => x.targetFqdn == fqdn && (x.targetTypes.size == 0 || x.targetTypes.has(type)));
      if (ownership?.isOurs) {

        const labels = {
          'heritage': 'external-dns',
          'external-dns/owner': this.config.txt_owner_id,
          [`record-type/${type}`]: 'managed',
        };
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
        desired.push(ownerRec);

      }
      if (ownership?.isAdoptable) throw new Error(`TODO: ownership adoption`);
      if (!ownership) {
        // const existing = = inner.Existing
        throw new Error(`TODO`)
      }
    }

    const rawOwners = new Map(inner.ownershipRecords.map(x => [x.record, x]));
    for (const record of inner.originalState.Existing) {
      const ownership = rawOwners.get(record);
      if (ownership) {
        if (!ownership.isOurs) {
          desired.push(record);
        } else {
          // our own ownerships will be freshly generated instead
        }
      } else if (!relevantCoords.has(JSON.stringify([record.dns.fqdn, record.dns.type]))) {
        desired.push(record);
      }
    }



    // Deno.exit(56);

    console.log('final desired:', desired);

    // for (const desired of )

    return Promise.resolve({
      Zone: inner.Zone,
      Existing: inner.originalState.Existing,
      Desired: desired,
    });
  }

  // heritageRecords = new Map<string, Tinput>();
  // unusedNames = new Set<string>();
  // nameLabelsMap = new Map<string, Record<string, string>>();

  // RecognizeLabels(raw: Array<Tinput>): Promise<Array<TxtRegistryRecord<Tinput>>> {
  //   const byNameMap = new Map<string, Array<TxtRegistryRecord<Tinput>>>();
  //   this.nameLabelsMap = new Map<string, Record<string, string>>();

  //   for (let recordset of raw) {
  //     if (recordset.dns.type === 'TXT') {
  //       const heritageValue = recordset.Targets.find(x => x.startsWith(`heritage=`));
  //       if (heritageValue && recordset.DNSName.startsWith(this.registry.recordPrefix)) {

  //         const labels = parseLabels(heritageValue);
  //         labels[`is-ours`] = (
  //           labels['heritage'] === 'external-dns'
  //           && labels['external-dns/owner'] === this.registry.ownerId
  //         ) ? 'yes' : '';
  //         labels[`is-adoptable`] = (
  //           labels['heritage'] === 'external-dns'
  //           && this.registry.autoAdoptFrom.includes(labels['external-dns/owner'])
  //         ) ? 'yes' : '';
  //         this.nameLabelsMap.set(recordset.DNSName.slice(this.registry.recordPrefix.length), labels);

  //         if (recordset.Targets.length === 1) {
  //           this.heritageRecords.set(recordset.DNSName, recordset);
  //           continue;
  //         } else {
  //           const [heritageRec, otherTxts] = SplitOutTarget(recordset, x => x === heritageValue);
  //           this.heritageRecords.set(recordset.DNSName, heritageRec);
  //           recordset = otherTxts;
  //         }
  //       }
  //     }

  //     const byNameList = byNameMap.get(recordset.DNSName);
  //     if (byNameList) {
  //       byNameList.push(recordset);
  //     } else {
  //       byNameMap.set(recordset.DNSName, [recordset]);
  //     }
  //   }

  //   this.unusedNames = new Set<string>(this.nameLabelsMap.keys());
  //   for (const [name, labels] of this.nameLabelsMap) {
  //     for (const rec of byNameMap.get(name) ?? []) {
  //       const hasTypes = Object.keys(labels).some(x => x.startsWith('record-type/'));
  //       if (!hasTypes || labels[`record-type/${rec.RecordType}`]) {
  //         rec.Labels = labels;
  //       }
  //       this.unusedNames.delete(name);
  //     }
  //   }
  //   return Promise.resolve(Array.from(byNameMap.values()).flat());
  // }

  // CommitLabels(changes: Changes): Promise<Changes> {
  //   // const deletedTxts = new Set<string>();
  //   const newTxtLabels = new Map<string,Record<string,string>>();
  //   const realChanges = new Changes(changes.sourceRecords,
  //     new Array<Endpoint>().concat(
  //       changes.existingRecords,
  //       Array.from(this.heritageRecords.values())));

  //   const grabNewTxtLabels = (recordName: string) => {
  //     const txtName = this.registry.recordPrefix + recordName;
  //     // if we're already planning something, roll with it
  //     let existingLabels = newTxtLabels.get(txtName);
  //     // if not but the TXT did exist, start a mutation
  //     if (!existingLabels) {
  //       const prevLabels = this.nameLabelsMap.get(recordName);
  //       if (prevLabels) {
  //         existingLabels = {...prevLabels};
  //         newTxtLabels.set(txtName, existingLabels);
  //       }
  //     }
  //     // if still not, start a blank new record
  //     if (!existingLabels) {
  //       existingLabels = {
  //         'heritage': 'external-dns',
  //         'external-dns/owner': this.registry.ownerId,
  //       };
  //       newTxtLabels.set(txtName, existingLabels);
  //     } else if (this.registry.autoAdoptFrom.includes(existingLabels['external-dns/owner'])) {
  //       console.error('"Adopting" record', recordName, 'from', existingLabels['external-dns/owner']);
  //       existingLabels['external-dns/owner'] = this.registry.ownerId;
  //     }
  //     return existingLabels;
  //   }

  //   // copy over all creates, and also their heritage, only once
  //   for (const created of changes.Create) {
  //     realChanges.Create.push(created);

  //     // if we already owned it, continue owning it for sure
  //     this.unusedNames.delete(created.DNSName);

  //     const desiredLabels = grabNewTxtLabels(created.DNSName);
  //     desiredLabels[`record-type/${created.RecordType}`] = 'managed';

  //     // TODO: if multiple sources, clean up the more specific labels
  //     for (const [key, val] of Object.entries(created.Labels ?? {})) {
  //       desiredLabels[key] = val;
  //     }
  //   }

  //   for (const [before, after] of changes.Update) {
  //     realChanges.Update.push([before, after]);

  //     const desiredLabels = grabNewTxtLabels(after.DNSName);
  //     desiredLabels[`record-type/${after.RecordType}`] = 'managed';

  //     // TODO: if multiple sources, clean up the more specific labels
  //     for (const [key, val] of Object.entries(after.Labels ?? {})) {
  //       desiredLabels[key] = val;
  //     }
  //   }

  //   // copy over all deletes, and also their heritage, only once
  //   for (const deleted of changes.Delete) {
  //     realChanges.Delete.push(deleted);

  //     // TODO: only deleting one priority of an MX would break this!
  //     delete grabNewTxtLabels(deleted.DNSName)[`record-type/${deleted.RecordType}`];
  //   }


  //   for (const [txtName, labels] of newTxtLabels) {
  //     const hasTypes = Object.keys(labels).some(x => x.startsWith('record-type/'));
  //     delete labels['is-ours'];
  //     delete labels['is-adoptable'];

  //     const existingEndpoint = this.heritageRecords.get(txtName);
  //     const newEndpoint: Endpoint | null = hasTypes ? {
  //       DNSName: txtName,
  //       RecordType: 'TXT',
  //       Targets: [Object.entries(labels).map(x => x.join('=')).join(',')],
  //     } : null;
  //     // console.log(existingEndpoint, newEndpoint)

  //     if (existingEndpoint?.Targets[0] === newEndpoint?.Targets[0]) {
  //       // No changes to TXT record.
  //     } else if (existingEndpoint) {
  //       if (newEndpoint) {
  //         realChanges.Update.push([existingEndpoint, newEndpoint]);
  //       } else {
  //         realChanges.Delete.push(existingEndpoint);
  //       }
  //     } else if (newEndpoint) {
  //       realChanges.Create.push(newEndpoint);
  //     }
  //   }

  //   for (const unusedName of this.unusedNames) {
  //     const txtName = this.registry.recordPrefix + unusedName;
  //     const heritage = this.heritageRecords.get(txtName);
  //     if (!heritage) throw new Error(`BUG: didn't find heritage record ${txtName}`);
  //     realChanges.Delete.push(heritage);
  //   }

  //   return Promise.resolve(realChanges);
  // }

}

function parseLabels(raw: string): Record<string,string> {
  const labels: Record<string,string> = Object.create(null);
  for (const part of raw.split(',')) {
    const [key, val] = part.split('=');
    labels[key] = val;
  }
  return labels;
}
