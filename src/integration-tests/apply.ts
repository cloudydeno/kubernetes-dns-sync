import { assertEquals } from "https://deno.land/std@0.115.0/testing/asserts.ts";

import type {
  BaseRecord, DnsProvider, DnsRegistry, SourceRecord, ZoneState,
} from "../defs/types.ts";

import { buildDiff } from "../lib/zone-diff.ts";

export async function applyToProvider<
  Tsource extends BaseRecord,
>(
  provider: DnsProvider<Tsource>,
  registry: DnsRegistry<Tsource>,
  source: SourceRecord[],
) {

  const zones = await provider.ListZones();
  assertEquals(zones.length, 1);

  const state: ZoneState<Tsource> = {
    Zone: zones[0],
    Existing: await provider.ListRecords(zones[0]),
  };

  await registry.ApplyDesiredRecords(state, source, r => provider.EnrichSourceRecord(r));

  state.Diff = buildDiff(state, provider);
  await provider.ApplyChanges(state);

  return state;
}
