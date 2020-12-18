import { IngressSourceConfig, DnsSource, Endpoint, SplitOutTarget, SplitByIPVersion } from "../common/mod.ts";
import { KubernetesClient, Reflector } from '../deps.ts';
import { NetworkingV1beta1Api, IngressFields } from "https://deno.land/x/kubernetes_apis@v0.1.0/builtin/networking.k8s.io@v1beta1/mod.ts";

export class IngressSource implements DnsSource {

  constructor(
    public config: IngressSourceConfig,
    private client: KubernetesClient,
  ) {}
  networkingApi = new NetworkingV1beta1Api(this.client);
  requiredAnnotations = Object.entries(this.config.annotation_filter ?? {});

  reflector?: Reflector<IngressFields>;
  inSync = false;

  async Endpoints() {
    const endpoints = new Array<Endpoint>();

    const resources = (this.inSync ? this.reflector?.listCached() : null)
      ?? (await this.networkingApi.getIngressListForAllNamespaces()).items;

    ings: for (const node of resources) {
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

  async* AddEventHandler(): AsyncGenerator<void> {
    if (!this.reflector) {
      this.reflector = new Reflector(
        opts => this.networkingApi.getIngressListForAllNamespaces({ ...opts }),
        opts => this.networkingApi.watchIngressListForAllNamespaces({ ...opts }));
      this.reflector.run(); // kinda just toss this away...
    } else {
      console.log(`WARN: Adding another event handler to existing reflector`);
    }

    console.log('observing Ingresses...');
    this.inSync = false;
    for await (const evt of this.reflector.observeAll()) {
      switch (evt.type) {
        case 'SYNCED':
          yield;
          this.inSync = true; // start allowing falling-edge runs
          break;
        case 'DESYNCED':
          this.inSync = false; // block runs during resync inconsistencies
          break;
        case 'ADDED':
        case 'MODIFIED':
        case 'DELETED':
          if (this.inSync) yield;
          break;
      }
    }
    console.log('Ingress observer done');
  }

}
