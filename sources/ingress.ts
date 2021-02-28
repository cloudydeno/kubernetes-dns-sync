import { IngressSourceConfig, DnsSource, Endpoint, SplitOutTarget, SplitByIPVersion, WatchLister } from "../common/mod.ts";
import { KubernetesClient } from '../deps.ts';
import { NetworkingV1beta1Api } from "https://deno.land/x/kubernetes_apis@v0.3.0/builtin/networking.k8s.io@v1beta1/mod.ts";

export class IngressSource implements DnsSource {

  constructor(
    public config: IngressSourceConfig,
    private client: KubernetesClient,
  ) {}
  networkingApi = new NetworkingV1beta1Api(this.client);

  watchLister = new WatchLister('Ingress',
    opts => this.networkingApi.getIngressListForAllNamespaces({ ...opts }),
    opts => this.networkingApi.watchIngressListForAllNamespaces({ ...opts }));

  async Endpoints() {
    const endpoints = new Array<Endpoint>();

    for await (const node of this.watchLister.getFreshList(this.config.annotation_filter)) {
      if (!node.metadata || !node.spec?.rules || !node.status?.loadBalancer?.ingress) continue;

      const [ttl] = Object
        .entries(node.metadata.annotations ?? {})
        .flatMap(x => x[0] === 'external-dns.alpha.kubernetes.io/ttl'
          ? [parseInt(x[1])]
          : []);

      for (const rule of node.spec.rules) {
        if (!rule.host) continue;
        const hostnames = node.status.loadBalancer.ingress
          .flatMap(x => x.hostname ? [x.hostname] : []);
        const addresses = node.status.loadBalancer.ingress
          .flatMap(x => x.ip ? [x.ip] : []);

        if (hostnames.length > 0) {
          endpoints.push({
            DNSName: rule.host,
            RecordType: 'CNAME',
            Targets: hostnames,
            RecordTTL: ttl,
            Labels: {
              'external-dns/resource': `ingress/${node.metadata.namespace}/${node.metadata.name}`,
            },
            SplitOutTarget,
          });
        } else if (addresses.length > 0) {
          endpoints.push(...SplitByIPVersion({
            DNSName: rule.host,
            RecordType: 'A',
            Targets: addresses,
            RecordTTL: ttl,
            Labels: {
              'external-dns/resource': `ingress/${node.metadata.namespace}/${node.metadata.name}`,
            },
            SplitOutTarget,
          }));
        }
      }

    }
    return endpoints;
  }

  MakeEventSource() {
    return this.watchLister.getEventSource();
  }

}
