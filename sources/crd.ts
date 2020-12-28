import { CrdSourceConfig, DnsSource, Endpoint, SplitOutTarget, SplitByIPVersion } from "../common/mod.ts";
import { KubernetesClient, Reflector } from '../deps.ts';
import { ExternaldnsV1alpha1Api, DNSEndpoint } from "https://raw.githubusercontent.com/danopia/deno-kubernetes_apis/f542e66d229afd296c7af3820d254f8cd07d3c43/lib/external-dns/externaldns.k8s.io@v1alpha1/mod.ts";

export class CrdSource implements DnsSource {

  constructor(
    public config: CrdSourceConfig,
    private client: KubernetesClient,
  ) {}
  crdApi = new ExternaldnsV1alpha1Api(this.client);
  requiredAnnotations = Object.entries(this.config.annotation_filter ?? {});

  reflector?: Reflector<DNSEndpoint>;
  inSync = false;

  async Endpoints() {
    const endpoints = new Array<Endpoint>();

    const resources = (this.inSync ? this.reflector?.listCached() : null)
      ?? (await this.crdApi.getDNSEndpointListForAllNamespaces()).items;

    ings: for (const node of resources) {
      if (!node.metadata || !node.spec?.endpoints) continue ings;

      if (this.requiredAnnotations.length > 0) {
        if (!node.metadata.annotations) continue ings;
        for (const [key, val] of this.requiredAnnotations) {
          if (node.metadata.annotations[key] !== val) continue ings;
        }
      }

      for (const rule of node.spec.endpoints) {
        if (!rule.dnsName || !rule.recordType || !rule.targets?.length) continue;
        const endpoint: Endpoint = {
          DNSName: rule.dnsName,
          RecordType: rule.recordType,
          Targets: rule.targets,
          Labels: {
            'external-dns/resource': `crd/${node.metadata.namespace}/${node.metadata.name}`,
            ...(rule.labels || {}),
          },
          RecordTTL: rule.recordTTL ?? undefined,
          ProviderSpecific: (rule.providerSpecific ?? []).map(x => ({Name: x.name ?? '', Value: x.value ?? ''})),
          SplitOutTarget,
        };

        // TODO: also SRV
        if (endpoint.RecordType === 'MX') {
          const allPrios = new Set(endpoint.Targets.map(x => x.split(' ')[0]));
          for (const priority of Array.from(allPrios)) {
            const subEndpoint = endpoint.SplitOutTarget(x => x.split(' ')[0] === priority)[0];
            subEndpoint.Priority = parseInt(priority);
            subEndpoint.Targets = subEndpoint.Targets.map(x => x.split(' ')[1]);
            endpoints.push(subEndpoint);
          }
        } else {
          endpoints.push(endpoint);
        }
      }

      // TODO: this shouldn't be done until we made the change
      if (node.metadata.generation && node.status?.observedGeneration !== node.metadata.generation) {
        node.status = {
          observedGeneration: node.metadata.generation,
        };

        await this.crdApi
          .namespace(node.metadata.namespace!)
          .replaceDNSEndpointStatus(node.metadata.name!, node);
      }

    }
    return endpoints;
  }

  async* MakeEventSource(): AsyncGenerator<void> {
    if (!this.reflector) {
      this.reflector = new Reflector(
        opts => this.crdApi.getDNSEndpointListForAllNamespaces({ ...opts }),
        opts => this.crdApi.watchDNSEndpointListForAllNamespaces({ ...opts }));
      this.reflector.run(); // kinda just toss this away...
    } else {
      console.log(`WARN: Adding another event handler to existing reflector`);
    }

    console.log('observing CRDs...');
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
    console.log('CRD observer done');
  }

}
