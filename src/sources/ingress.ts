import { KubernetesClient, NetworkingV1Api } from '../deps.ts';

import type { IngressSourceConfig } from "../common/config.ts";
import type { DnsSource, SourceRecord, PlainRecordHostname } from "../common/types.ts";
import { WatchLister } from './lib/watch-lister.ts';

import { splitIntoV4andV6 } from "../dns-logic/endpoints.ts";

export class IngressSource implements DnsSource {

  constructor(
    public config: IngressSourceConfig,
    private client: KubernetesClient,
  ) {
    this.networkingApi = new NetworkingV1Api(this.client);
  }
  networkingApi: NetworkingV1Api;

  watchLister = new WatchLister('Ingress',
    opts => this.networkingApi.getIngressListForAllNamespaces({ ...opts }),
    opts => this.networkingApi.watchIngressListForAllNamespaces({ ...opts }),
    ing => [ing.metadata?.annotations, ing.spec?.rules, ing.status?.loadBalancer?.ingress]);

  async ListRecords() {
    const endpoints = new Array<SourceRecord>();

    for await (const ingress of this.watchLister.getFreshList(this.config.annotation_filter)) {
      if (!ingress.metadata || !ingress.spec?.rules || !ingress.status?.loadBalancer?.ingress) continue;

      for (const rule of ingress.spec.rules) {
        if (!rule.host) continue;
        const hostnames = ingress.status.loadBalancer.ingress
          .flatMap(x => x.hostname ? [x.hostname] : []);
        const addresses = ingress.status.loadBalancer.ingress
          .flatMap(x => x.ip ? [x.ip] : []);

        const records = hostnames.length > 0
          ? hostnames.map<PlainRecordHostname>(
              hostname => ({
                type: 'CNAME',
                target: hostname,
              }))
          : splitIntoV4andV6(addresses);

        if (!records.length) continue;
        for (const record of records) {
          endpoints.push({
            annotations: ingress.metadata.annotations ?? {},
            resourceKey: `ingress/${ingress.metadata.namespace}/${ingress.metadata.name}`,
            dns: {
              fqdn: rule.host.replace(/\.$/, ''),
              ...record,
            }});
        }
      }

    }
    return endpoints;
  }

  MakeEventSource() {
    return this.watchLister.getEventSource();
  }

}
