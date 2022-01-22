#!/usr/bin/env -S deno run --allow-env --allow-read --allow-run=kubectl --allow-net --unstable

import {
  TOML,
  runMetricsServer,
  replaceGlobalFetch,
} from '../deps.ts';

import { isControllerConfig } from "../common/mod.ts";
import * as configure from "./configure.ts";
import { createTickStream } from "./ticks.ts";

const config = TOML.parse(await Deno.readTextFile('config.toml'));
if (!isControllerConfig(config)) throw new Error(`config.toml was invalid`);
console.log('Parsed configuration:', JSON.stringify(config));

const sources = config.source.map(configure.source);
const providers = config.provider.map(configure.provider);
const registry = [config.registry].map(configure.registry)[0];

import {
  p3, p2, p1, p0,
  printTick,
  loadSourceEndpoints,
  discoverProviderChanges,
  printChanges,
  confirmBeforeApplyingChanges,
} from "./output.ts";

if (Deno.args.includes('--serve-metrics')) {
  replaceGlobalFetch();
  runMetricsServer({ port: 9090 });
  console.log(p2, "Now serving OpenMetrics @ :9090/metrics");
}

// Main loop
for await (const tickSource of createTickStream(config, sources)) {

  // Log why we're here
  printTick(tickSource?.config.type);

  const { sourceRecords, resourceKeys } = await loadSourceEndpoints(sources);

  const appliedZoneFqdns = new Array<string>();
  for (const provider of providers) {
    const providerId = provider.config.type;
    // const providerCtx = await provider.NewContext();
    // const registryCtx = registry.NewContext(providerCtx.Zones);

    let skipped = false;
    for await (const diff of discoverProviderChanges(registry, providerId, provider, sourceRecords)) {
      if (diff.Diff!.length === 0) {
        console.log(p2, 'Provider', providerId, 'has no necesary changes for', diff.Zone.fqdn);
        appliedZoneFqdns.push(diff.Zone.fqdn);
        continue;
      }

      printChanges(diff);
      if (!confirmBeforeApplyingChanges()) {
        skipped = true;
        continue;
      }

      const toCreate = diff.Diff!.filter(x => x.type == 'creation').length;
      const toUpdate = diff.Diff!.filter(x => x.type == 'update').length;
      const toDelete = diff.Diff!.filter(x => x.type == 'deletion').length;

      console.log(p1, 'Submitting', toCreate, 'to create,', toUpdate, 'to update,', toDelete, 'to delete', 'to', providerId, 'for', diff.Zone.fqdn, '...');
      await provider.ApplyChanges(diff);

      console.log('');
      appliedZoneFqdns.push(diff.Zone.fqdn);
    }

    if (skipped) {
      console.log(p2, 'Provider', providerId, 'is done syncing. However, not all desired actions were taken.');
    } else {
      console.log(p2, 'Provider', providerId, 'is now up to date.');
    }
  }

  for (const [source, keys] of resourceKeys) {
    if (!source.ObserveResource) continue;
    for (const key of keys) {
      // TODO: need to only do this for records under appliedZoneFqdns
      await source.ObserveResource(key);
    }
  }

  console.log();
}
console.log(p3, 'Process completed without error.');
