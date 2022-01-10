import { intersection } from "../deps.ts";
import { BaseRecord, Endpoint, PlainRecord, PlainRecordAddress, ZoneDiff, ZoneState } from "./contract.ts";

export function splitIntoV4andV6(targets: string[]): PlainRecordAddress[] {
  const endpoints = new Array<PlainRecordAddress>();
  for (const target of targets) {
    if (target.includes(':')) {
      endpoints.push({ type: 'AAAA', target });
    } else if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(target)) {
      endpoints.push({ type: 'A', target });
    }
  }
  return endpoints;
}

export function getPlainRecordKey(record: PlainRecord) {
  switch (record.type) {
    case 'A':
    case 'AAAA':
    case 'NS':
    case 'CNAME':
      return [record.fqdn, record.type, record.ttl, record.target];
    case 'TXT':
      return [record.fqdn, record.type, record.ttl, record.content];
    case 'MX':
      return [record.fqdn, record.type, record.ttl, record.priority, record.target];
    default:
      const _: never = record;
      throw new Error(`unreachable`);
  }
}

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
