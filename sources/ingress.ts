import { IngressSourceConfig, DnsSource, Endpoint, SplitOutTarget, SplitByIPVersion } from "../common/mod.ts";

import { RestClient } from "https://deno.land/x/kubernetes_client@v0.1.0/mod.ts";
import { NetworkingV1beta1Api } from "https://deno.land/x/kubernetes_apis@v0.1.0/builtin/networking.k8s.io@v1beta1/mod.ts";

export class IngressSource implements DnsSource {

  constructor(
    public config: IngressSourceConfig,
    private client: RestClient,
  ) {}
  networkingApi = new NetworkingV1beta1Api(this.client);
  requiredAnnotations = Object.entries(this.config.annotation_filter ?? {});

  async Endpoints() {
    const endpoints = new Array<Endpoint>();

    ings: for (const node of (await this.networkingApi.getIngressListForAllNamespaces()).items) {
      if (!node.metadata || !node.spec?.rules || !node.status?.loadBalancer?.ingress) continue ings;

      if (this.requiredAnnotations.length > 0) {
        if (!node.metadata.annotations) continue ings;
        for (const [key, val] of this.requiredAnnotations) {
          if (node.metadata.annotations[key] !== val) continue ings;
        }
      }

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

  AddEventHandler(cb: () => void) {
    throw new Error("Method not implemented.");
  }

}
