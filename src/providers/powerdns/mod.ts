import type { PowerDnsProviderConfig } from "../../defs/config.ts";
import type {
  DnsProvider, BaseRecord, Zone, SourceRecord, ZoneState, PlainRecordMX,
} from "../../defs/types.ts";

import { enrichSourceRecord, getPlainRecordKey } from "../../lib/dns-endpoints.ts";
import { transformFromRrdata, transformToRrdata } from "../../lib/dns-rrdata.ts";

import { DnsRecordSet, PowerDnsApi } from "./api.ts";

// TODO: SRV and MX do not strictly follow rrdata; priority has its own slot
// https://doc.powerdns.com/authoritative/appendices/types.html

export class PowerDnsProvider implements DnsProvider<BaseRecord> {
  constructor(
    public config: PowerDnsProviderConfig,
  ) {
    this.api = new PowerDnsApi(
      this.config.api_endpoint ?? 'http://127.0.0.1:8081/api/',
      this.config.server_id ?? 'localhost');
  }
  api: PowerDnsApi;

	async ListZones() {
    const zones = new Array<Zone>();
    const domainFilter = new Set(this.config.domain_filter?.map(x => x.replace(/\.$/, '')) ?? []);
    for (const zone of await this.api.listAllZones()) {
      const fqdn = zone.name.replace(/\.$/, '');
      if (domainFilter.size > 0 && !domainFilter.has(fqdn)) continue;
      zones.push({fqdn: fqdn, zoneId: zone.id});
    }
    return zones;
  }

  ComparisionKey(record: BaseRecord): string {
    // no extra config stored with DNS records
    return JSON.stringify(getPlainRecordKey(record.dns));
  }
  GroupingKey(record: BaseRecord): string {
    // This 'should' line up with how rrdata recordsets are
    return JSON.stringify([record.dns.fqdn, record.dns.type]);
  }

  EnrichSourceRecord(record: SourceRecord): BaseRecord | null {
    return enrichSourceRecord(record, {
      minTtl: 60,
      defaultTtl: 300,
    });
  }

  async ListRecords(zone: Zone): Promise<BaseRecord[]> {
    const endpoints = new Array<BaseRecord>(); // every recordset we find
    const zoneData = await this.api.getZone(zone.fqdn);
    for (const recordSet of zoneData.rrsets) {
      for (const record of recordSet.records) {
        // if (re)
        endpoints.push({
          // recordSet: record,
          dns: {
            fqdn: recordSet.name.replace(/\.$/, ''),
            ttl: recordSet.ttl,
            ...transformFromRrdata(recordSet.type as any, record.content),
          }
        });
      }
    }
    return endpoints;
  }

  async ApplyChanges(changes: ZoneState<BaseRecord>): Promise<void> {
    const patch: DnsRecordSet[] = changes.Diff!.map(change => {
      const firstDesired = (change.desired[0] || change.existing[0]);
      return {
        name: firstDesired.dns.fqdn +'.',
        type: firstDesired.dns.type,
        ttl: firstDesired.dns.ttl ?? 300,
        priority: (firstDesired.dns as PlainRecordMX).priority,
        changetype: change.type === 'deletion' ? 'DELETE' : 'REPLACE',
        comments: [],
        records: change.desired.map(y => ({
          content: transformToRrdata(y.dns),
          disabled: false,
        })),
      };
    });

    await this.api.patchZoneRecords(changes.Zone.zoneId, patch);
  }

}
