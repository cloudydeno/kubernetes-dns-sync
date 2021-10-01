import {
  TOML,
  runMetricsServer,
  replaceGlobalFetch,
} from '../deps.ts';

import { isControllerConfig } from "../common/mod.ts";
import { Planner } from "./planner.ts";
import * as configure from "./configure.ts";
import { createTickStream } from "./ticks.ts";

const config = TOML.parse(await Deno.readTextFile('config.toml'));
if (!isControllerConfig(config)) throw new Error(`config.toml was invalid`);
console.log('Parsed configuration:', JSON.stringify(config));

const sources = config.source.map(configure.source);
const providers = config.provider.map(configure.provider);
const registry = [config.registry].map(configure.registry)[0];

const p3 = '   ';
const p2 = '-->';
const p1 = '==>';
const p0 = '!!!';

if (Deno.args.includes('--serve-metrics')) {
  replaceGlobalFetch();
  runMetricsServer({ port: 9090 });
  console.log(p2, "Now serving OpenMetrics @ :9090/metrics");
}

// Main loop
for await (const tickSource of createTickStream(config, sources)) {
  console.log();

  // Log why we're here
  const tickReason = tickSource
    ? `via ${tickSource.config.type}`
    : 'via schedule';
  console.log('---', new Date(), tickReason);

  console.log(p2, 'Loading desired records from', sources.length, 'sources...');
  const sourceRecords = await Promise.all(sources.map(async source => {
    const endpoints = await source.Endpoints();
    console.log(p3, 'Discovered', endpoints.length, 'desired records from', source.config.type);
    return endpoints;
  })).then(x => x.flat());
  console.log(p2, 'Discovered', sourceRecords.length, 'desired records overall');

  for (const provider of providers) {
    const providerId = provider.config.type;
    const providerCtx = await provider.NewContext();
    const registryCtx = registry.NewContext(providerCtx.Zones);

    console.log(p3, 'Loading existing records from', providerId, '...');
    const rawExisting = await providerCtx.Records();
    console.log(p3, 'Recognizing ownership labels on', rawExisting.length, 'records...');
    const existingRecords = await registryCtx.RecognizeLabels(rawExisting);
    console.log(p2, 'Found', existingRecords.length, 'existing records from', providerId);

    const planner = new Planner(providerCtx.Zones);
    const changes = planner.PlanChanges(sourceRecords, existingRecords);
    console.log(p3, 'Planner changes:', ...changes.summary());

    console.log(p3, 'Encoding changed ownership labels...');
    const rawChanges = await registryCtx.CommitLabels(changes);
    if (rawChanges.length() === 0) {
      console.log(p2, 'Provider', providerId, 'has no necesary changes.');
      continue;
    }

    for (const rec of rawChanges.Create) {
      if (rec.RecordType === 'TXT') { // long records
        console.log(p2, '- Create:', rec.RecordType, rec.DNSName);
        for (const targetVal of rec.Targets) {
          console.log(p3, '    new:', targetVal);
        }
      } else {
        console.log(p2, '- Create:', rec.RecordType, rec.DNSName, rec.Targets);
      }
    }

    for (const [recOld, recNew] of rawChanges.Update) {
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

    for (const rec of rawChanges.Delete) {
      if (rec.RecordType === 'TXT') { // long records
        console.log(p2, '- Delete:', rec.RecordType, rec.DNSName);
        for (const targetVal of rec.Targets) {
          console.log(p3, '    old:', targetVal);
        }
      } else {
        console.log(p2, '- Delete:', rec.RecordType, rec.DNSName, rec.Targets);
      }
    }

    if (Deno.args.includes('--dry-run')) {
      console.log(p1, "Doing no changes due to --dry-run");
      continue;
    } else if (!Deno.args.includes('--yes')) {
      if (prompt(`    Proceed with editing provider records?`, 'yes') !== 'yes') throw new Error(
        `User declined to perform provider edits`);
    }

    console.log(p1, 'Submitting', ...rawChanges.summary(), 'to', providerId, '...');
    await providerCtx.ApplyChanges(rawChanges);
    console.log(p2, 'Provider', providerId, 'is now up to date.');
  }

  console.log();
}
console.log(p3, 'Process completed without error.');
