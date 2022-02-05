import type { BaseRecord, ZoneState } from "../defs/types.ts";
import { log } from "../deps.ts";
import { transformToRrdata } from "./dns-rrdata.ts";

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
