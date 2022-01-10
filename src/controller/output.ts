import type {
  Endpoint, Changes,
  DnsProviderContext,
  DnsRegistryContext,
} from "../common/mod.ts";
import { Planner } from "./planner.ts";

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
  Endpoints: () => Promise<Array<Endpoint>>;
  config: { type: string },
}>) {
  console.log(p2, 'Loading desired records from', sources.length, 'sources...');
  const sourceRecords = await Promise.all(sources.map(async source => {
    const endpoints = await source.Endpoints();
    console.log(p3, 'Discovered', endpoints.length, 'desired records from', source.config.type);
    return endpoints;
  })).then(x => x.flat());
  console.log(p2, 'Discovered', sourceRecords.length, 'desired records overall');
  return sourceRecords;
}

export async function discoverProviderChanges<T>(
  registryCtx: DnsRegistryContext,
  providerId: string,
  providerCtx: DnsProviderContext,
  sourceRecords: Endpoint[],
) {
  console.log(p3, 'Loading existing records from', providerId, '...');
  const rawExisting = await providerCtx.Records();
  console.log(p3, 'Recognizing ownership labels on', rawExisting.length, 'records...');
  const existingRecords = await registryCtx.RecognizeLabels(rawExisting);
  console.log(p2, 'Found', existingRecords.length, 'existing records from', providerId);

  const planner = new Planner(providerCtx.Zones);
  const changes = planner.PlanChanges(sourceRecords, existingRecords);
  console.log(p3, 'Planner changes:', ...changes.summary);

  console.log(p3, 'Encoding changed ownership labels...');
  return await registryCtx.CommitLabels(changes);
}

export function printChanges(changes: Changes) {
  for (const rec of changes.Create) {
    if (rec.RecordType === 'TXT') { // long records
      console.log(p2, '- Create:', rec.RecordType, rec.DNSName);
      for (const targetVal of rec.Targets) {
        console.log(p3, '    new:', targetVal);
      }
    } else {
      console.log(p2, '- Create:', rec.RecordType, rec.DNSName, rec.Targets);
    }
  }

  for (const [recOld, recNew] of changes.Update) {
    if (recOld.RecordType === 'TXT') { // long records
      console.log(p2, '- Update:', recOld.RecordType, recOld.DNSName);
      for (const targetVal of recOld.Targets) {
        console.log(p3, '    old:', targetVal);
      }
      for (const targetVal of recNew.Targets) {
        console.log(p3, '    new:', targetVal);
      }
    } else {
      console.log(p2, '- Update:', recOld.RecordType, recOld.DNSName, recOld.Targets, '->', recNew.Targets);
    }
  }

  for (const rec of changes.Delete) {
    if (rec.RecordType === 'TXT') { // long records
      console.log(p2, '- Delete:', rec.RecordType, rec.DNSName);
      for (const targetVal of rec.Targets) {
        console.log(p3, '    old:', targetVal);
      }
    } else {
      console.log(p2, '- Delete:', rec.RecordType, rec.DNSName, rec.Targets);
    }
  }
}

export function confirmBeforeApplyingChanges() {
  if (Deno.args.includes('--dry-run')) {
    console.log(p1, "Doing no changes due to --dry-run");
    return false;

  } else if (!Deno.args.includes('--yes')) {
    const result = prompt(`${p3} Proceed with editing provider records?`, 'no');
    if (result !== 'yes') throw new Error(
      `User declined to perform provider edits`);
  }

  return true;
}
