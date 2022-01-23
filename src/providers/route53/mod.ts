import { AwsApiFactory, log, r53 } from "../../deps.ts";

import type { Route53ProviderConfig } from "../../config.ts";
import type {
  BaseRecord, DnsProvider, Zone, SourceRecord, ZoneState,
} from "../../types.ts";

import { enrichSourceRecord, getPlainRecordKey } from "../../dns-logic/endpoints.ts";
import { transformFromRrdata, transformToRrdata } from "../../dns-logic/rrdata.ts";

export type Route53Record = BaseRecord & {
  rrset?: r53.ResourceRecordSet;
}

export class Route53Provider implements DnsProvider<Route53Record> {
  constructor(
    public config: Route53ProviderConfig,
  ) {
    this.api = new AwsApiFactory({
      region: this.config.region ?? 'us-east-1',
    }).makeNew(r53.Route53);
  }
  private readonly api: r53.Route53;

  async ListZones(): Promise<Array<Zone>> {
    const zones = new Array<Zone>();
    const zoneIdFilter = new Set(this.config.zone_id_filter ?? []);
    const domainFilter = new Set(this.config.domain_filter ?? []);
    let Marker: string | undefined = undefined;
    do {
      const resp: r53.ListHostedZonesResponse = await this.api.listHostedZones({ Marker });
      for (const zone of resp.HostedZones) {
        const cleanId = zone.Id.replace('/hostedzone/', '');
        if (zoneIdFilter.size > 0 && !zoneIdFilter.has(cleanId)) continue;
        if (domainFilter.size > 0 && !domainFilter.has(zone.Name)) continue;
        zones.push({ fqdn: zone.Name.replace(/\.$/, ''), zoneId: cleanId });
      }
      Marker = resp.NextMarker ?? undefined;
    } while (Marker);
    return zones;
  }

  ComparisionKey(record: Route53Record): string {
    // Route53 has extra things like delegation sets and alias records
    // We'll ignore for now, but definitely something to address down the road
    // if this provider starts seeing real use.
    return JSON.stringify(getPlainRecordKey(record.dns));
  }
  GroupingKey(record: Route53Record): string {
    return JSON.stringify([record.dns.fqdn, record.dns.type]);
  }

  EnrichSourceRecord(record: SourceRecord): Route53Record | null {
    // TODO: alias records and so on
    return enrichSourceRecord(record, {
      minTtl: 1,
      defaultTtl: 300,
    });
  }

  async ListRecords(zone: Zone): Promise<Route53Record[]> {
    const endpoints = new Array<Route53Record>(); // every recordset we find

    let request: r53.ListResourceRecordSetsRequest = {
      HostedZoneId: zone.zoneId,
    };
    do {
      const resp = await this.api.listResourceRecordSets(request);
      request.StartRecordIdentifier = resp.NextRecordIdentifier;
      request.StartRecordName = resp.NextRecordName;
      request.StartRecordType = resp.NextRecordType;

      for (const rrset of resp.ResourceRecordSets) {
        if (rrset.Failover ||
            rrset.AliasTarget ||
            rrset.GeoLocation ||
            rrset.HealthCheckId ||
            rrset.MultiValueAnswer ||
            rrset.Region ||
            rrset.SetIdentifier ||
            rrset.TrafficPolicyInstanceId ||
            rrset.Weight) {
          log.warning(`Ignoring Route53 record set ${rrset.Name} ${rrset.Type
            } because it uses features which kubernetes-dns-sync does not handle.`);
          continue;
        }

        const dnsName = rrset.Name.replace(/\.$/, '');
        for (const rrdata of rrset.ResourceRecords ?? []) {
          endpoints.push({
            rrset,
            dns: {
              fqdn: dnsName,
              ttl: rrset.TTL,
              ...transformFromRrdata(rrset.Type as any, rrdata.Value),
            }
          });
        }
      }
    } while (request.StartRecordName);
    return endpoints;
  }

  async ApplyChanges(state: ZoneState<Route53Record>): Promise<void> {
    const zone = state.Zone;
    const changes = new Array<r53.Change>();

    for (const diff of state.Diff ?? []) {
      // For deletions we provide every record,
      // but for upserts (and creates) we only provide new.

      if (diff.type === 'deletion') {
        const rrset = diff.existing[0].rrset;
        if (!rrset) throw new Error(`BUG: wanted to delete null route53 rrset`);
        changes.push({
          Action: 'DELETE',
          ResourceRecordSet: rrset,
        });

      } else {
        const {fqdn, type} = diff.desired[0].dns;
        const ttls = diff.desired.map(x => x.dns.ttl).flatMap(x => x ? [x] : []);
        changes.push({
          Action: diff.type == "creation" ? 'CREATE' : 'UPSERT',
          ResourceRecordSet: {
            Name: `${fqdn}.`,
            Type: type,
            TTL: ttls.length ? Math.min(...ttls) : 300,
            ResourceRecords: diff.desired.map<r53.ResourceRecord>(x => ({
              Value: transformToRrdata(x.dns),
            })),
          } });
      }
    }

    if (!changes.length) return;
    log.debug(`Route53 zone ${zone.zoneName} - ${changes.length} changes`);

    // Actually submit the changes
    const {ChangeInfo} = await this.api.changeResourceRecordSets({
      HostedZoneId: zone.zoneId,
      ChangeBatch: {
        Comment: `Automatic sync by kubernetes-dns-sync`,
        Changes: changes,
      },
    });
    const changeId = ChangeInfo.Id.replace('/change/', '')

    log.info(`Route53 change ${changeId
      } on ${zone.fqdn} at ${new Date(ChangeInfo.SubmittedAt).toISOString()
      } is ${ChangeInfo.Status} ...`);

    const final = await this.api.waitForResourceRecordSetsChanged({ Id: changeId });
    log.info(`Route53 change ${changeId} is ${final.ChangeInfo.Status}`);
  }

}
