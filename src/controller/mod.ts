#!/usr/bin/env -S deno run --allow-env --allow-read --allow-run=kubectl --allow-net --unstable

import {
  log,
  TOML,
  runMetricsServer,
  replaceGlobalFetch,
} from '../deps.ts';

import { isControllerConfig } from "../config.ts";
import { configureSource } from "../sources/_configure.ts";
import { configureProvider } from "../providers/_configure.ts";
import { configureRegistry } from "../registries/_configure.ts";

import { createTickStream } from "./ticks.ts";
import {
  printTick,
  loadSourceEndpoints,
  discoverProviderChanges,
  printChanges,
  confirmBeforeApplyingChanges,
} from "./output.ts";
import { setupLogs } from "./logging.ts";

const config = TOML.parse(await Deno.readTextFile('config.toml'));
if (!isControllerConfig(config)) throw new Error(`config.toml was invalid`);

await setupLogs({
  logLevel: Deno.args.includes('--debug') ? "DEBUG" : "INFO",
  logFormat: Deno.args.includes('--log-as-json') ? "json" : "console",
});

log.debug(`Parsed configuration: ${JSON.stringify(config)}`);
const lister = new Intl.ListFormat();
log.info(`Configuration summary:
      ${config.source.length} sources: ${lister.format(config.source.map(x => x.type))}
      ${config.provider.length} providers: ${lister.format(config.provider.map(x => x.type))}
      registry: ${config.registry.type}`);

const sources = await Promise.all(config.source.map(configureSource));
const providers = config.provider.map(configureProvider);
const registry = [config.registry].map(configureRegistry)[0];

if (Deno.args.includes('--serve-metrics')) {
  replaceGlobalFetch();
  runMetricsServer({ port: 9090 });
  log.info("Now serving OpenMetrics @ :9090/metrics");
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
    for await (const state of discoverProviderChanges(registry, providerId, provider, sourceRecords)) {
      if (!state.Diff?.length) {
        log.debug(`Provider ${providerId} has no necesary changes for ${state.Zone.fqdn}`);
        appliedZoneFqdns.push(state.Zone.fqdn);
        continue;
      }

      printChanges(state);
      if (!confirmBeforeApplyingChanges()) {
        skipped = true;
        continue;
      }

      log.warning(`Applying ${state.Diff.length} recordset changes on ${state.Zone.fqdn}...`);
      await provider.ApplyChanges(state);

      console.log('');
      appliedZoneFqdns.push(state.Zone.fqdn);
    }

    if (skipped) {
      log.info(`Provider ${providerId} is done syncing. However, not all desired actions were taken.`);
    } else {
      log.info(`Provider ${providerId} is now up to date.`);
    }
  }

  for (const [source, keys] of resourceKeys) {
    if (!source.ObserveResource) continue;
    for (const key of keys) {
      // TODO: need to only do this for records under appliedZoneFqdns
      await source.ObserveResource(key);
    }
  }

  console.log('');
}
log.info('Process completed without error.');
