import { Zone, Changes, Endpoint } from "../common/contract.ts";
import { intersection, union } from "../deps.ts";

// export class Planner {
//   constructor(
//     private zones: Zone[],
//   ) {}

//   findZoneForName(dnsName: string): Zone | undefined {
//     const matches = this.zones.filter(x => x.DNSName == dnsName || dnsName.endsWith('.'+x.DNSName));
//     return matches.sort((a,b) => b.DNSName.length - a.DNSName.length)[0];
//   }

//   PlanChanges(sourceRecords: Endpoint[], existingRecords: Endpoint[]): Changes {
//     const changes = new Changes(sourceRecords, existingRecords);

//     const recordsByName = new Map<string, {
//       source: Endpoint[];
//       oursExisting: Endpoint[];
//       adoptableExisting: Endpoint[];
//       othersExisting: Endpoint[];
//     }>();
//     function getByName(name: string) {
//       let records = recordsByName.get(name.toLowerCase());
//       if (!records) {
//         records = {
//           source: [],
//           oursExisting: [],
//           adoptableExisting: [],
//           othersExisting: [],
//         };
//         recordsByName.set(name.toLowerCase(), records);
//       }
//       return records;
//     }

//     for (const sourceRecord of sourceRecords) {
//       getByName(sourceRecord.DNSName).source.push(sourceRecord);
//     }
//     for (const existingRecord of existingRecords) {
//       if (existingRecord.Labels?.['is-ours']) {
//         getByName(existingRecord.DNSName).oursExisting.push(existingRecord);
//       } else if (existingRecord.Labels?.['is-adoptable']) {
//         getByName(existingRecord.DNSName).adoptableExisting.push(existingRecord);
//       } else {
//         getByName(existingRecord.DNSName).othersExisting.push(existingRecord);
//       }
//     }

//     for (const [name, records] of recordsByName) {
//       const zone = this.findZoneForName(name);
//       if (!zone) continue;

//       // No actions: Unmanaged records with no intention to conflict
//       if (records.source.length === 0 && records.oursExisting.length === 0) continue;
//       // Otherwise, if there's adoptables, we will take them in :)
//       if (records.adoptableExisting.length > 0) {
//         records.oursExisting = [...records.adoptableExisting, ...records.oursExisting];
//       }

//       const sourceTypes = new Set(records.source.map(x => x.RecordType));
//       const oursExistingTypes = new Set(records.oursExisting.map(x => x.RecordType));
//       const othersExistingTypes = new Set(records.othersExisting.map(x => x.RecordType));

//       const allTypes = union(sourceTypes, oursExistingTypes);
//       const typeOverlap = intersection(allTypes, othersExistingTypes);
//       // For now we simply fail if this happens
//       if (typeOverlap.size > 0) throw new Error(
//         `For ${name} ${Array.from(typeOverlap).join(',')}, we tried to clash with unmanaged records`);
//       if (othersExistingTypes.has('CNAME')) throw new Error(
//         `For ${name}, a CNAME already exists, so I can't really add anything.`);

//       for (const type of allTypes) {
//         const desiredEndps = records.source.filter(x => x.RecordType === type);
//         const actualEndps = records.oursExisting.filter(x => x.RecordType === type);
//         const desired = new Set(desiredEndps.flatMap(x => x.Targets));
//         const actual = new Set(actualEndps.flatMap(x => x.Targets));

//         if (type === 'SRV') throw new Error(`TODO: SRV not impl'd yet`);
//         if (type === 'MX') {
//           const allPriosInvolved = new Set(desiredEndps.map(x => x.Priority).concat(actualEndps.map(x => x.Priority)));
//           if (allPriosInvolved.size > 1) {
//             console.log(type, name, records);
//             throw new Error(`TODO: MX with multiple priorities not impl'd yet`);
//           }
//         }

//         const inCommon = intersection(desired, actual);
//         if (inCommon.size === desired.size && inCommon.size === actual.size) continue;

//         if (desired.size === 0) {
//           for (const rec of actualEndps) {
//             changes.Delete.push(rec);
//           }
//           continue;
//         }
//         if (actual.size === 0) {
//           for (const rec of desiredEndps) {
//             changes.Create.push(rec);
//           }
//           continue;
//         }
//         if (desiredEndps.length === 1 && actualEndps.length === 1) {
//           changes.Update.push([actualEndps[0], desiredEndps[0]]);
//           continue;
//         }

//         console.log('???', 'TODO:', name, type,
//           desiredEndps.length, desired,
//           actualEndps.length, actual,
//           inCommon);
//         Deno.exit(6);
//       }
//     }

//     return changes;
//   }
// }
