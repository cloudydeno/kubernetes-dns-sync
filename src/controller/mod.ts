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

  const sourceRecords = await loadSourceEndpoints(sources);

  for (const provider of providers) {
    const providerId = provider.config.type;
    const providerCtx = await provider.NewContext();
    const registryCtx = registry.NewContext(providerCtx.Zones);

    const rawChanges = await discoverProviderChanges(registryCtx, providerId, providerCtx, sourceRecords);

    if (rawChanges.length === 0) {
      console.log(p2, 'Provider', providerId, 'has no necesary changes.');
      continue;
    }

    printChanges(rawChanges);
    if (!confirmBeforeApplyingChanges()) continue;

    console.log(p1, 'Submitting', ...rawChanges.summary, 'to', providerId, '...');
    await providerCtx.ApplyChanges(rawChanges);
    console.log(p2, 'Provider', providerId, 'is now up to date.');
  }

  console.log();
}
console.log(p3, 'Process completed without error.');
