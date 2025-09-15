import type {
  DnsSource, DnsRegistry, DnsProvider,
  BaseRecord, SourceRecord, ZoneState,
} from "./defs/types.ts";

import {
  confirmBeforeApplyingChanges,
  printChanges,
} from "./lib/printing.ts";
import { buildDiff } from "./lib/zone-diff.ts";
import { log } from "./deps.ts";

export async function mainLoopIteration(
  sources: Array<DnsSource>,
  providers: Array<DnsProvider<BaseRecord>>,
  registry: DnsRegistry<BaseRecord>,
) {
  const { sourceRecords, resourceKeys } = await loadSourceEndpoints(sources);

  const appliedZoneFqdns = new Array<string>();
  for (const provider of providers) {
    const providerId = provider.config.type;

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

      log.warn(`Applying ${state.Diff.length} recordset changes on ${state.Zone.fqdn}...`);
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
}

async function loadSourceEndpoints(sources: Array<DnsSource>) {
  log.debug(`Loading desired records from ${sources.length} sources...`);
  const resourceKeys = new Map<DnsSource, Set<string>>();
  const sourceRecords = await Promise.all(sources.map(async source => {
    const endpoints = await source.ListRecords().catch(err => {
      log.error(`Source "${source.config.type}" failed to ListRecords`);
      throw err;
    });
    log.info(`Discovered ${endpoints.length} desired records from ${source.config.type}`);
    // TODO: also include zone name here somehow
    resourceKeys.set(source, new Set(endpoints.map(x => x.resourceKey)));
    return endpoints;
  })).then(x => x.flat());
  log.debug(`Discovered ${sourceRecords.length} desired records overall`);
  return { sourceRecords, resourceKeys };
}

async function* discoverProviderChanges<T extends BaseRecord>(
  registry: DnsRegistry<T>,
  providerId: string,
  provider: DnsProvider<T>,
  sourceRecords: SourceRecord[],
) {
  log.debug(`Listing zones for ${providerId}...`);
  const zoneList = await provider.ListZones();
  log.info(`Found ${zoneList.length} DNS zones from ${providerId}: ${zoneList.map(x => x.fqdn).join(', ')}`);

  for (const zone of zoneList) {
    log.debug(`Loading existing records from ${providerId} ${zone.fqdn}...`);
    const state: ZoneState<T> = {
      Zone: zone,
      Existing: await provider.ListRecords(zone),
    };

    const rawDesired = sourceRecords
      .filter(x => x.dns.fqdn == zone.fqdn || x.dns.fqdn.endsWith(`.${zone.fqdn}`));
    log.debug(`Found ${rawDesired.length} relevant source records`);

    await registry.ApplyDesiredRecords(state, rawDesired,
      r => provider.EnrichSourceRecord(r));

    state.Diff = buildDiff(state, provider);
    const toCreate = state.Diff.filter(x => x.type == 'creation').length;
    const toUpdate = state.Diff.filter(x => x.type == 'update').length;
    const toDelete = state.Diff.filter(x => x.type == 'deletion').length;
    if (toCreate || toUpdate || toDelete) {
      log.info(`Planned changes for ${zone.fqdn}: ${toCreate} to create, ${toUpdate} to update, ${toDelete} to delete`);
    } else {
      log.info(`No changes planned for ${zone.fqdn}`);
    }

    yield state;
  }
}
