import type {
  DnsSource, BaseRecord, DnsRegistry, DnsProvider, SourceRecord, ZoneState,
} from "../types.ts";

import { buildDiff } from "../dns-logic/diff.ts";
import { transformToRrdata } from "../dns-logic/rrdata.ts";
import { log } from "../deps.ts";

export function printTick(tickVia: string | undefined) {
  console.log('');
  log.info(`Sync triggered at ${new Date().toISOString()} by ${tickVia ?? 'schedule'}`);
}

export async function loadSourceEndpoints(sources: Array<DnsSource>) {
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

export async function* discoverProviderChanges<T extends BaseRecord>(
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

function printRecord(prefix: string, record: BaseRecord) {
  const bits = [
    `ttl=${record.dns.ttl}`,
    `data=${transformToRrdata(record.dns)}`,
  ];
  // cloudflare proxy status
  // TODO: cleaner way of registering any additional fields that are important to print
  if ('proxied' in record) {
    bits.unshift(`proxied=${(record as unknown as {proxied:boolean}).proxied}`);
  }
  return `    ${prefix} ${bits.join(' ')}`;
}

export function printChanges<T extends BaseRecord>(changes: ZoneState<T>) {
  log.debug(`Planned ${changes.Diff?.length} changes in ${changes.Zone.fqdn} :`);

  for (const change of changes.Diff ?? []) {
    const [sample] = [...change.desired, ...change.existing];
    const lines = [
      `For ${sample.dns.type} ${sample.dns.fqdn} :`
    ];

    for (const rec of change.toCreate) {
      lines.push(printRecord('create', rec));
    }
    for (const rec of change.toUpdate) {
      lines.push(printRecord('replace before', rec.existing));
      lines.push(printRecord('replace after', rec.desired));
    }
    for (const rec of change.toDelete) {
      lines.push(printRecord('delete', rec));
    }

    // If we're leaving no records behind here, let's stress that a bit.
    log[change.type == 'deletion' ? 'warning' : 'info'](lines.join('\n')+'\n');
  }
}

export function confirmBeforeApplyingChanges() {
  if (Deno.args.includes('--dry-run')) {
    log.info("Doing no changes due to --dry-run");
    return false;

  } else if (!Deno.args.includes('--yes')) {
    const result = prompt(`==> Proceed with editing provider records?`, 'no');
    if (result !== 'yes') {
      log.warning(`User declined to perform provider edits`);
      return false;
    }
  }

  return true;
}
