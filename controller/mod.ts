import { fixedInterval } from 'https://danopia.net/deno/fixed-interval@v1.ts';
import * as TOML from 'https://deno.land/std@0.79.0/encoding/toml.ts';
import {autoDetectClient} from "https://deno.land/x/kubernetes_client@v0.1.0/mod.ts";

import { isControllerConfig } from "../common/config.ts";
import { Planner } from "./planner.ts";

// TODO: consider dynamic imports for all these config-driven ones?

import { IngressSource } from '../sources/ingress.ts';
import { CrdSource } from '../sources/crd.ts';
import { NodeSource } from '../sources/node.ts';

import { GoogleProvider } from '../providers/google/mod.ts';
import { VultrProvider } from '../providers/vultr/mod.ts';

import { TxtRegistry } from "../registries/txt.ts";
import { NoopRegistry } from "../registries/noop.ts";

const kubernetesClient = await autoDetectClient();

const config = TOML.parse(await Deno.readTextFile('config.toml'));
if (!isControllerConfig(config)) throw new Error(`config.toml was invalid`);
console.log('Parsed configuration:', JSON.stringify(config));

const sources = config.source.map(source => {
  switch (source.type) {
    case 'ingress':
      return new IngressSource(source, kubernetesClient);
    case 'crd':
      return new CrdSource(source);
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

const planner = new Planner;
const p3 = '   ';
const p2 = '-->';
const p1 = '==>';
const p0 = '!!!';

for await (const _ of fixedInterval((config.interval_seconds ?? 60) * 1000)) {
  console.log();
  console.log('---', new Date());

  console.log(p2, 'Loading desired records from', sources.length, 'sources...');
  const sourceRecords = await Promise.all(sources.map(async source => {
    const endpoints = await source.Endpoints();
    console.log(p3, 'Discovered', endpoints.length, 'desired records from', source.config.type);
    return endpoints;
  })).then(x => x.flat());
  console.log(p2, 'Discovered', sourceRecords.length, 'desired records overall');

  for (const provider of providers) {
    const registryCtx = registry.NewContext();

    console.log(p3, 'Loading existing records from', provider.config.type, '...');
    const rawExisting = await provider.Records();
    console.log(p3, 'Recognizing ownership labels on', rawExisting.length, 'records...');
    const existingRecords = await registryCtx.RecognizeLabels(rawExisting);
    console.log(p2, 'Found', existingRecords.length, 'existing records from', provider.config.type);

    const changes = planner.PlanChanges(sourceRecords, existingRecords);
    console.log(p3, 'Planner changes:', ...changes.summary());

    console.log(p3, 'Encoding changed ownership labels...');
    const rawChanges = await registryCtx.CommitLabels(changes);
    if (rawChanges.length() === 0) {
      console.log(p2, 'Provider', provider.config.type, 'has no necesary changes.');
      continue;
    }

    console.log(p1, 'Submitting', ...rawChanges.summary(), 'to', provider.config.type, '...');
    await provider.ApplyChanges(rawChanges);
    console.log(p2, 'Provider', provider.config.type, 'is now up to date.');
  }

  if (Deno.args.includes('--once')) break;
}
console.log(p3, 'Process completed without error.');
