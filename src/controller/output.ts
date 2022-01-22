import { buildDiff } from "../common/diff.ts";
import {
  DnsProvider,
  DnsRegistry,
  SourceRecord,
  BaseRecord,
  ZoneState,
} from "../common/mod.ts";
// import { Planner } from "./planner.ts";

export const p3 = '   ';
export const p2 = '-->';
export const p1 = '==>';
export const p0 = '!!!';

export function printTick(tickVia: string | undefined) {
  console.log();
  const tickReason = tickVia
    ? `via ${tickVia}`
    : 'via schedule';
  console.log('---', new Date().toISOString(), tickReason);
}

export async function loadSourceEndpoints(sources: Array<{
  ListRecords: () => Promise<Array<SourceRecord>>;
  config: { type: string },
}>) {
  console.log(p2, 'Loading desired records from', sources.length, 'sources...');
  const sourceRecords = await Promise.all(sources.map(async source => {
    const endpoints = await source.ListRecords();
    console.log(p3, 'Discovered', endpoints.length, 'desired records from', source.config.type);
    return endpoints;
  })).then(x => x.flat());
  console.log(p2, 'Discovered', sourceRecords.length, 'desired records overall');
  return sourceRecords;
}

export async function discoverProviderChanges<T extends BaseRecord>(
  registryCtx: DnsRegistry<T>,
  providerId: string,
  providerCtx: DnsProvider<T>,
  sourceRecords: SourceRecord[],
) {
  console.log(p3, 'Listing zones for', providerId, '...');
  const zoneList = await providerCtx.ListZones();
  console.log(p2, 'Found', zoneList.length, 'DNS zones:', zoneList.map(x => x.fqdn));

  const byZone = new Array<ZoneState<T>>();
  for (const zone of zoneList) {
    console.log(p3, 'Loading existing records from', providerId, zone.fqdn, '...');
    const state: ZoneState<T> = {
      Zone: zone,
      Existing: await providerCtx.ListRecords(zone),
    };

    // console.log(p3, 'Recognizing ownership labels on', state.Existing.length, 'records...');
    // console.log(p2, 'Found', innerState.Existing.length, 'existing records from', providerId, zone.fqdn);

    const rawDesired = sourceRecords
      .filter(x => x.dns.fqdn == zone.fqdn || x.dns.fqdn.endsWith(`.${zone.fqdn}`));
    console.log(p2, 'Found', rawDesired.length, 'relevant source records');

    await registryCtx.ApplyDesiredRecords(state, rawDesired, r => providerCtx.EnrichSourceRecord(r));

    state.Diff = buildDiff(state, providerCtx);
    const toCreate = state.Diff.filter(x => x.type == 'creation').length;
    const toUpdate = state.Diff.filter(x => x.type == 'update').length;
    const toDelete = state.Diff.filter(x => x.type == 'deletion').length;
    console.log(p3, 'Planner changes:', toCreate, 'to create,', toUpdate, 'to update,', toDelete, 'to delete');

    byZone.push(state);
  }
  return byZone;
}

export function printChanges<T extends BaseRecord>(changes: ZoneState<T>) {

  for (const change of changes.Diff ?? []) {
    console.log(p2, `- ${change.type}:`, JSON.stringify(change));
  }

  // for (const rec of changes.toCreate) {
  //   console.log(p2, '- Create:', JSON.stringify(rec.dns));
  //   // if (rec.RecordType === 'TXT') { // long records
  //   //   console.log(p2, '- Create:', rec.RecordType, rec.fqdn);
  //   //   for (const targetVal of rec.Targets) {
  //   //     console.log(p3, '    new:', targetVal);
  //   //   }
  //   // } else {
  //   //   console.log(p2, '- Create:', rec.RecordType, rec.fqdn, rec.Targets);
  //   // }
  // }

  // // for (const [recOld, recNew] of changes.Update) {
  // //   if (recOld.RecordType === 'TXT') { // long records
  // //     console.log(p2, '- Update:', recOld.RecordType, recOld.fqdn);
  // //     for (const targetVal of recOld.Targets) {
  // //       console.log(p3, '    old:', targetVal);
  // //     }
  // //     for (const targetVal of recNew.Targets) {
  // //       console.log(p3, '    new:', targetVal);
  // //     }
  // //   } else {
  // //     console.log(p2, '- Update:', recOld.RecordType, recOld.fqdn, recOld.Targets, '->', recNew.Targets);
  // //   }
  // // }

  // for (const rec of changes.toDelete) {
  //   // if (rec.dns.type === 'TXT') { // long records
  //   //   console.log(p2, '- Delete:', rec.dns.type, rec.dns.fqdn);
  //   //   for (const targetVal of rec.Targets) {
  //   //     console.log(p3, '    old:', targetVal);
  //   //   }
  //   // } else {
  //   console.log(p2, '- Delete:', JSON.stringify(rec.dns));
  //   // }
  // }
}

export function confirmBeforeApplyingChanges() {
  if (Deno.args.includes('--dry-run')) {
    console.log(p1, "Doing no changes due to --dry-run");
    return false;

  } else if (!Deno.args.includes('--yes')) {
    const result = prompt(`${p3} Proceed with editing provider records?`, 'no');
    if (result !== 'yes') {
      console.log(`User declined to perform provider edits`);
      return false;
    }
  }

  return true;
}
