import {
  TxtRegistryConfig,
  DnsRegistry,
  BaseRecord, ZoneState,
} from "../common/mod.ts";


type TxtRegistryRecord<T extends BaseRecord> = T & {
  heritage: string;
  owner: string;
  recordTypes: string[];
}

interface TxtRegistryState<T extends BaseRecord> extends ZoneState<TxtRegistryRecord<T>> {

}

/** Manages record ownership in-band with regular TXT records */
export class TxtRegistry<Tinput extends BaseRecord> implements DnsRegistry<Tinput,TxtRegistryRecord<Tinput>> {
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

    console.log('ownership records:', ownershipRecords);
    Deno.exit(4);

    return Promise.resolve({
      Zone: fromProvider.Zone,
      Existing: [], // fromProvider.Existing,
      // Desired: fromProvider.Desired,
    });
  }

  CommitLabels(inner: TxtRegistryState<Tinput>): Promise<ZoneState<Tinput>> {
    return Promise.resolve(inner);
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
