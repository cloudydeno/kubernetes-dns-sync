#!/usr/bin/env -S deno run --allow-env --allow-read --allow-run=kubectl --allow-net --unstable

import {
  log,
  TOML,
} from './deps.ts';

import { isControllerConfig } from "./defs/config.ts";
import { configureSource } from "./sources/_configure.ts";
import { configureProvider } from "./providers/_configure.ts";
import { configureRegistry } from "./registries/_configure.ts";

import { createTickStream } from "./lib/ticks.ts";
import { setupLogs } from "./lib/logging.ts";

import {
  mainLoopIteration,
} from "./logic.ts";

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

// Main loop
for await (const tickSource of createTickStream(config, sources)) {
  console.log('');
  log.info(`Sync triggered at ${new Date().toISOString()
    } by ${tickSource}`);

  await mainLoopIteration(sources, providers, registry);

  console.log('');
}
log.info('Process completed without error.');
