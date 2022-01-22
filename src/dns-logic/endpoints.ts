import type { PlainRecord, PlainRecordAddress } from "../common/types.ts";

export const AllSupportedRecords: Record<PlainRecord['type'], true> = {
  'A': true,
  'AAAA': true,
  'NS': true,
  'CNAME': true,
  'TXT': true,
  'MX': true,
	'SOA': true,
	'SRV': true,
};

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
      return [record.fqdn, record.type, record.ttl,
        record.priority, record.target];
    case 'SRV':
      return [record.fqdn, record.type, record.ttl,
        record.priority, record.weight, record.port, record.target];
    case 'SOA':
      return [record.fqdn, record.type, record.ttl,
        record.sourceHost, record.contactHost,
        record.serial, record.refresh, record.retry, record.expire, record.minimum];
    default:
      const _: never = record;
      throw new Error(`unreachable`);
  }
}
