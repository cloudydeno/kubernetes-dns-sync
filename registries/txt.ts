import { TxtRegistryConfig, Changes, DnsRegistry, DnsRegistryContext, Endpoint } from "../common/mod.ts";

/** Manages record ownership in-band with regular TXT records */
export class TxtRegistry implements DnsRegistry<TxtRegistryContext> {
  ownerId: string;
  recordPrefix: string;
  recordSuffix: string;
  autoImport: boolean;
  constructor(public config: TxtRegistryConfig) {
    this.ownerId = config.txt_owner_id;
    this.recordPrefix = config.txt_prefix ?? '';
    this.recordSuffix = config.txt_suffix ?? '';
    this.autoImport = config.auto_import ?? false;
    if (this.recordSuffix) throw new Error(`TODO: txt suffixes - where do they go?`);
  }

  NewContext() {
    return new TxtRegistryContext(this);
  }
}

class TxtRegistryContext implements DnsRegistryContext {
  constructor(private registry: TxtRegistry) {}
  heritageRecords = new Map<string, Endpoint>();
  unusedNames = new Set<string>();

  RecognizeLabels(raw: Endpoint[]): Promise<Endpoint[]> {
    const byNameMap = new Map<string, Endpoint[]>();
    const nameLabelsMap = new Map<string, Record<string, string>>();
    for (let recordset of raw) {
      if (recordset.RecordType === 'TXT') {
        const heritageValue = recordset.Targets.find(x => x.startsWith(`heritage=`));
        if (heritageValue && recordset.DNSName.startsWith(this.registry.recordPrefix)) {

          const labels = parseLabels(heritageValue);
          labels[`is-ours`] = (
            labels['heritage'] === 'external-dns'
            && labels['external-dns/owner'] === this.registry.ownerId
          ) ? 'yes' : '';
          nameLabelsMap.set(recordset.DNSName.slice(this.registry.recordPrefix.length), labels);

          if (recordset.Targets.length === 1) {
            this.heritageRecords.set(recordset.DNSName, recordset);
            continue;
          } else {
            const [heritageRec, otherTxts] = recordset.SplitOutTarget(x => x === heritageValue);
            this.heritageRecords.set(recordset.DNSName, heritageRec);
            recordset = otherTxts;
          }
        }
      }

      const byNameList = byNameMap.get(recordset.DNSName);
      if (byNameList) {
        byNameList.push(recordset);
      } else {
        byNameMap.set(recordset.DNSName, [recordset]);
      }
    }

    this.unusedNames = new Set<string>(nameLabelsMap.keys());
    for (const [name, labels] of nameLabelsMap) {
      for (const rec of byNameMap.get(name) ?? []) {
        rec.Labels = labels;
        this.unusedNames.delete(name);
      }
    }
    return Promise.resolve(Array.from(byNameMap.values()).flat());
  }

  CommitLabels(changes: Changes): Promise<Changes> {
    const deletedTxts = new Set<string>();
    const realChanges = new Changes(changes.sourceRecords,
      new Array<Endpoint>().concat(
        changes.existingRecords,
        Array.from(this.heritageRecords.values())));

    if (changes.Delete.length >= 1 && changes.Create.length === 0 && changes.Update.length === 0) {

      // copy over all deletes, and also their heritage, only once
      for (const deleted of changes.Delete) {
        realChanges.Delete.push(deleted);
        const txtName = this.registry.recordPrefix + deleted.DNSName;
        if (!deletedTxts.has(txtName)) {
          const heritage = this.heritageRecords.get(txtName);
          if (!heritage) throw new Error(`BUG: didn't find heritage record ${txtName}`);
          realChanges.Delete.push(heritage);
          deletedTxts.add(txtName);
        }
      }

    } else if (changes.length() > 0) {
      console.log(this, changes.Create, changes.Update, changes.Delete);
      throw new Error("Method only partially implemented.");
    }

    for (const create of changes.Create) {
      this.unusedNames.delete(create.DNSName);
    }
    for (const unusedName of this.unusedNames) {
      const txtName = this.registry.recordPrefix + unusedName;
      const heritage = this.heritageRecords.get(txtName);
      if (!heritage) throw new Error(`BUG: didn't find heritage record ${txtName}`);
      realChanges.Delete.push(heritage);
    }

    return Promise.resolve(realChanges);
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
