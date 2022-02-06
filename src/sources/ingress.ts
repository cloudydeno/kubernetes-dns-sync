import { KubernetesClient, NetworkingV1Api } from '../deps.ts';

import type { IngressSourceConfig } from "../defs/config.ts";
import type { DnsSource, SourceRecord, PlainRecordHostname } from "../defs/types.ts";

import { splitIntoV4andV6 } from "../lib/dns-endpoints.ts";
import { KubernetesLister } from "../lib/kubernetes-lister.ts";

export class IngressSource implements DnsSource {

  constructor(
    public config: IngressSourceConfig,
    private client: KubernetesClient,
  ) {
    this.networkingApi = new NetworkingV1Api(this.client);
  }
  networkingApi: NetworkingV1Api;

  lister = new KubernetesLister('Ingress',
    opts => this.networkingApi.getIngressListForAllNamespaces({ ...opts }),
    opts => this.networkingApi.watchIngressListForAllNamespaces({ ...opts }),
    {
      annotationFilter: () => this.config.annotation_filter ?? {},
      changeDetectionKeys: res => [res.spec?.rules, res.status?.loadBalancer?.ingress],
    });

  async ListRecords() {
    const endpoints = new Array<SourceRecord>();

    for await (const ingress of this.lister.getFreshList()) {
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
    return this.lister.getEventSource();
  }
}
