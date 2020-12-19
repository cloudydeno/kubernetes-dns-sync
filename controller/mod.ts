import {
  TOML,
  autoDetectKubernetesClient,
  // observables:
  just, fromAsyncIterator, fromTimer,
  map, merge, debounce,
} from '../deps.ts';

import { DnsSource, isControllerConfig } from "../common/mod.ts";
import { Planner } from "./planner.ts";

// TODO: consider dynamic imports for all these config-driven imports?

import { IngressSource } from '../sources/ingress.ts';
import { CrdSource } from '../sources/crd.ts';
import { NodeSource } from '../sources/node.ts';

import { GoogleProvider } from '../providers/google/mod.ts';
import { VultrProvider } from '../providers/vultr/mod.ts';

import { TxtRegistry } from "../registries/txt.ts";
import { NoopRegistry } from "../registries/noop.ts";

const kubernetesClient = await autoDetectKubernetesClient();

const config = TOML.parse(await Deno.readTextFile('config.toml'));
if (!isControllerConfig(config)) throw new Error(`config.toml was invalid`);
console.log('Parsed configuration:', JSON.stringify(config));

const sources = config.source.map(source => {
  switch (source.type) {
    case 'ingress':
      return new IngressSource(source, kubernetesClient);
    case 'crd':
      return new CrdSource(source, kubernetesClient);
    case 'node':
      return new NodeSource(source, kubernetesClient);
    default:
      throw new Error(`Invalid source 'type' ${(source as any).type}`);
  }
});

const providers = config.provider.map(provider => {
  switch (provider.type) {
    case 'google':
      return new GoogleProvider(provider);
    case 'vultr':
      return new VultrProvider(provider);
    default:
      throw new Error(`Invalid provider 'type' ${(provider as any).type}`);
  }
});

const registry = [config.registry].map(registry => {
  switch (registry.type) {
    case 'txt':
      return new TxtRegistry(registry);
    case 'noop':
      return new NoopRegistry(registry);
    default:
      throw new Error(`Invalid registry 'type' ${(registry as any).type}`);
  }
})[0];

const p3 = '   ';
const p2 = '-->';
const p1 = '==>';
const p0 = '!!!';

const tickStreams = new Array<ReadableStream<DnsSource | null>>();
// Always start with one tick as startup
tickStreams.push(just(null));

if (Deno.args.includes('--once')) {
  // Do nothing else after initial tick.

} else if (config.enable_watching) {
  // Subscribe to every source's events
  for (const source of sources) {
    tickStreams.push(fromAsyncIterator(source
      .MakeEventSource())
      .pipeThrough(map(x => source)));
  }
  // Also regular infrequent ticks just in case
  const bgPollMillis = (config.interval_seconds ?? (60 * 60)) * 1000;
  tickStreams.push(fromTimer(bgPollMillis)
    .pipeThrough(map(() => null)));

} else {
  // Just plain regular ticks at a fixed interval
  const bgPollMillis = (config.interval_seconds ?? 60) * 1000;
  tickStreams.push(fromTimer(bgPollMillis)
    .pipeThrough(map(() => null)));
}

// Merge every tick source and debounce
const actionableTicks = merge(...tickStreams)
  .pipeThrough(debounce((config.debounce_seconds ?? 2) * 1000));

// Per each tick...
for await (const tickSource of actionableTicks) {
  const tickReason = tickSource
    ? `via ${tickSource.config.type}`
    : 'via schedule';
  console.log();
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
      console.log(p2, '- Create:', rec.RecordType, rec.DNSName, rec.Targets);
    }
    for (const [recOld, recNew] of rawChanges.Update) {
      console.log(p2, '- Update:', recOld.RecordType, recOld.DNSName, recOld.Targets, '->', recNew.Targets);
    }
    for (const rec of rawChanges.Delete) {
      console.log(p2, '- Delete:', rec.RecordType, rec.DNSName, rec.Targets);
    }

    if (Deno.args.includes('--dry-run')) {
      console.log(p1, "Doing no changes due to --dry-run");
    } else if (!Deno.args.includes('--yes')) {
      if (prompt(`Proceed with editing provider records?`, 'yes') !== 'yes') throw new Error(
        `User declined to perform provider edits`);
    }

    console.log(p1, 'Submitting', ...rawChanges.summary(), 'to', providerId, '...');
    await providerCtx.ApplyChanges(rawChanges);
    console.log(p2, 'Provider', providerId, 'is now up to date.');
  }

  console.log();
}
console.log(p3, 'Process completed without error.');
