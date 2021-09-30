import { IngressSourceConfig, DnsSource, Endpoint, SplitOutTarget, SplitByIPVersion, WatchLister } from "../common/mod.ts";
import { KubernetesClient } from '../deps.ts';
import {
  Ingress as IngressV1, NetworkingV1Api,
} from "https://deno.land/x/kubernetes_apis@v0.3.1/builtin/networking.k8s.io@v1/mod.ts";
import {
  Ingress as IngressV1beta1, NetworkingV1beta1Api,
} from "https://deno.land/x/kubernetes_apis@v0.3.1/builtin/networking.k8s.io@v1beta1/mod.ts";

export class IngressSource implements DnsSource {

  constructor(
    public config: IngressSourceConfig,
    private client: KubernetesClient,
  ) {
    if (config.api_version == "v1beta1") {
      this.networkingApi = new NetworkingV1beta1Api(this.client);
    } else {
      this.networkingApi = new NetworkingV1Api(this.client);
    }
  }
  networkingApi: NetworkingV1Api | NetworkingV1beta1Api;

  watchLister = new WatchLister<IngressV1 | IngressV1beta1>('Ingress',
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
