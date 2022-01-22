import { assertEquals } from "https://deno.land/std@0.115.0/testing/asserts.ts";
import { BaseRecord, DnsProvider, DnsRegistry, SourceRecord } from "./contract.ts";
import { buildDiff } from "./diff.ts";

export async function applyToProvider<Tsource extends BaseRecord, Tinner extends Tsource>(provider: DnsProvider<Tsource>, registry: DnsRegistry<Tsource, Tinner>, source: SourceRecord[]) {

  const zones = await provider.ListZones();
  assertEquals(zones.length, 1);

  const state = await registry.RecognizeLabels({
    Zone: zones[0],
    Existing: await provider.ListRecords(zones[0]),
    Desired: source
      .map(x => provider.EnrichSourceRecord(x))
      .flatMap(x => x ? [x] : []),
  });

  const secondState = await registry.CommitLabels(state, r => provider.EnrichSourceRecord(r));
  secondState.Diff = buildDiff(secondState, provider);
  await provider.ApplyChanges(secondState);
  return secondState;
}
