import { intersection } from "../deps.ts";
import { BaseRecord, ZoneState, ZoneDiff } from "./contract.ts";

export function buildDiff<Trecord extends BaseRecord>(state: ZoneState<Trecord>, getComparisionKey: (record: Trecord) => string): ZoneDiff<Trecord> {
  if (!state.Desired) throw new Error(`Need Desired to build a diff`);

  const toCreate = new Array<Trecord>();
  const toDelete = new Array<Trecord>();

  const existingRecords = new Map(state.Existing.map(x => [getComparisionKey(x), x]));
  const desiredRecords = new Map(state.Desired.map(x => [getComparisionKey(x), x]));

  const matchingRecords = intersection(
    new Set(existingRecords.keys()),
    new Set(desiredRecords.keys()));

  for (const [key, record] of existingRecords) {
    if (!matchingRecords.has(key)) {
      toDelete.push(record);
    }
  }
  for (const [key, record] of desiredRecords) {
    if (!matchingRecords.has(key)) {
      toCreate.push(record);
    }
  }

  // console.log({toCreate, toDelete, matchingRecords})

  return {
    state,
    toCreate,
    toDelete,
  };
}
