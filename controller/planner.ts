import { Changes, Endpoint } from "../common/contract.ts";
import { intersection, union } from "../common/set-util.ts";

function makeKey(endp: Endpoint) {
  return [endp.DNSName, endp.RecordType, endp.Priority].join(':');
}

export class Planner {
  PlanChanges(sourceRecords: Endpoint[], existingRecords: Endpoint[]): Changes {
    const changes = new Changes(sourceRecords, existingRecords);

    const recordsByName = new Map<string, {
      source: Endpoint[];
      oursExisting: Endpoint[];
      othersExisting: Endpoint[];
    }>();
    function getByName(name: string) {
      let records = recordsByName.get(name.toLowerCase());
      if (!records) {
        records = {
          source: [],
          oursExisting: [],
          othersExisting: [],
        };
        recordsByName.set(name.toLowerCase(), records);
      }
      return records;
    }

    for (const sourceRecord of sourceRecords) {
      getByName(sourceRecord.DNSName).source.push(sourceRecord);
    }
    for (const existingRecord of existingRecords) {
      if (existingRecord.Labels && existingRecord.Labels['is-ours']) {
        getByName(existingRecord.DNSName).oursExisting.push(existingRecord);
      } else {
        getByName(existingRecord.DNSName).othersExisting.push(existingRecord);
      }
    }

    for (const [name, records] of recordsByName) {
      // No actions: Unmanaged records with no intention to conflict
      if (records.source.length === 0 && records.oursExisting.length === 0) continue;

      const sourceTypes = new Set(records.source.map(x => x.RecordType));
      const oursExistingTypes = new Set(records.oursExisting.map(x => x.RecordType));
      const othersExistingTypes = new Set(records.othersExisting.map(x => x.RecordType));

      const allTypes = union(sourceTypes, oursExistingTypes);
      const typeOverlap = intersection(allTypes, othersExistingTypes);
      // For now we simply fail if this happens
      if (typeOverlap.size > 0) throw new Error(
        `For ${name} ${Array.from(typeOverlap).join(',')}, we tried to clash with unmanaged records`);
      if (othersExistingTypes.has('CNAME')) throw new Error(
        `For ${name}, a CNAME already exists, so I can't really add anything.`);

      for (const type of allTypes) {
        if (type === 'MX' || type === 'SRV') throw new Error(`TODO: MX/SRV priority not impl'd yet`);
        const desired = new Set(records.source.flatMap(x => x.RecordType === type ? x.Targets : []));
        const actual = new Set(records.oursExisting.flatMap(x => x.RecordType === type ? x.Targets : []));

        const inCommon = intersection(desired, actual);
        if (inCommon.size === desired.size && inCommon.size === actual.size) continue;

        if (desired.size === 0) {
          for (const rec of records.oursExisting) {
            changes.Delete.push(rec);
          }
          continue;
        }

        console.log('???', 'TODO:', name, type, desired, actual, inCommon);
        Deno.exit(6);
      }
    }

    // const orphanRecords = new Set<string>();
    // const differentRecords = new Set<string>();
    // const neededRecords = new Set<string>();
    // for (const existingRecord of existingRecords) {
    //   if (existingRecord.Labels && existingRecord.Labels['is-ours']) {
    //     orphanRecords.add()
    //   }
    //   existingRecord.DNSName
    // }


    return changes;
  }
}
