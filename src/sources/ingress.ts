import { IngressSourceConfig, DnsSource, SourceRecord, WatchLister, splitIntoV4andV6, PlainRecordHostname } from "../common/mod.ts";
import { KubernetesClient, NetworkingV1Api } from '../deps.ts';

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
    opts => this.networkingApi.watchIngressListForAllNamespaces({ ...opts }));

  async ListRecords() {
    const endpoints = new Array<SourceRecord>();

    for await (const node of this.watchLister.getFreshList(this.config.annotation_filter)) {
      if (!node.metadata || !node.spec?.rules || !node.status?.loadBalancer?.ingress) continue;

      for (const rule of node.spec.rules) {
        if (!rule.host) continue;
        const hostnames = node.status.loadBalancer.ingress
          .flatMap(x => x.hostname ? [x.hostname] : []);
        const addresses = node.status.loadBalancer.ingress
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
            annotations: node.metadata.annotations ?? {},
            resourceKey: `ingress/${node.metadata.namespace}/${node.metadata.name}`,
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
