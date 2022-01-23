import { SetUtil } from "../deps.ts";

import type {
  BaseRecord, ZoneState, DnsProvider, RecordGroupDiff,
} from "../types.ts";

// TODO: the grouping/comparision keys should probably be enriched once directly onto the records
export function buildDiff<Trecord extends BaseRecord>(state: ZoneState<Trecord>, rules: Pick<DnsProvider<Trecord>, 'GroupingKey' | 'ComparisionKey'>): Array<RecordGroupDiff<Trecord>> {
  if (!state.Desired) throw new Error(`Need Desired to build a diff`);

  const changes = new Array<RecordGroupDiff<Trecord>>();

  const existingWithGroup = state.Existing.map(x => ({key: rules.GroupingKey(x), record: x}));
  const desiredWithGroup = state.Desired.map(x => ({key: rules.GroupingKey(x), record: x}));

  const existingGroups = new Set(existingWithGroup.map(x => x.key));
  const desiredGroups = new Set(desiredWithGroup.map(x => x.key));
  const intersectingGroups = SetUtil.intersection(existingGroups, desiredGroups);

  for (const groupKey of existingGroups) {
    if (intersectingGroups.has(groupKey)) continue;
    // this is a fully deleted group

    const existing = existingWithGroup.filter(x => x.key == groupKey).map(x => x.record);
    changes.push({
      type: 'deletion',
      existing,
      desired: [],
      toDelete: existing,
      toUpdate: [],
      toCreate: [],
    });
  }

  for (const groupKey of desiredGroups) {
    if (intersectingGroups.has(groupKey)) continue;
    // this is a fully created group

    const desired = desiredWithGroup.filter(x => x.key == groupKey).map(x => x.record);
    changes.push({
      type: 'creation',
      existing: [],
      desired,
      toDelete: [],
      toUpdate: [],
      toCreate: desired,
    });
  }

  for (const groupKey of intersectingGroups) {
    // this is a modified group

    const existing = existingWithGroup
      .filter(x => x.key == groupKey)
      .map(x => ({ key: rules.ComparisionKey(x.record), record: x.record }));
    const desired = desiredWithGroup
      .filter(x => x.key == groupKey)
      .map(x => ({ key: rules.ComparisionKey(x.record), record: x.record }));

    const intersectingKeys = SetUtil.intersection(
      new Set(existing.map(x => x.key)),
      new Set(desired.map(x => x.key)));

    if (intersectingKeys.size == existing.length && existing.length == desired.length) {
      // No changes! Right??
      continue;
    }

    changes.push({
      type: 'update',
      existing: existing.map(x => x.record),
      desired: desired.map(x => x.record),
      toDelete: existing.filter(x => !intersectingKeys.has(x.key)).map(x => x.record),
      toUpdate: [], // TODO: opportunistic in-place changes/patches
      toCreate: desired.filter(x => !intersectingKeys.has(x.key)).map(x => x.record),
    });
  }

  return changes;
}
