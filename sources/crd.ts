import { CrdSourceConfig, DnsSource, Endpoint, SplitOutTarget, WatchLister } from "../common/mod.ts";
import { KubernetesClient } from '../deps.ts';
import { ExternaldnsV1alpha1Api } from "https://deno.land/x/kubernetes_apis@v0.3.0/external-dns/externaldns.k8s.io@v1alpha1/mod.ts";

export class CrdSource implements DnsSource {

  constructor(
    public config: CrdSourceConfig,
    private client: KubernetesClient,
  ) {}
  crdApi = new ExternaldnsV1alpha1Api(this.client);

  watchLister = new WatchLister('CRD',
    opts => this.crdApi.getDNSEndpointListForAllNamespaces({ ...opts }),
    opts => this.crdApi.watchDNSEndpointListForAllNamespaces({ ...opts }),
    crd => [crd.metadata?.annotations, crd.spec]);

  async Endpoints() {
    const endpoints = new Array<Endpoint>();

    for await (const node of this.watchLister.getFreshList(this.config.annotation_filter)) {
      if (!node.metadata?.name || !node.metadata?.namespace || !node.spec?.endpoints) continue;

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

      // mark in status subresource that we saw the record
      // TODO: this probably shouldn't be done until we made the change
      if (node.metadata.generation && node.status?.observedGeneration !== node.metadata.generation) {
        await this.crdApi
          .namespace(node.metadata.namespace)
          .patchDNSEndpointStatus(node.metadata.name, 'json-merge', {
            status: {
              observedGeneration: node.metadata.generation,
            }}).catch(err => console.warn('Failed to observe DNSEndpoint CRD:', err.message));
      }

    }
    return endpoints;
  }

  MakeEventSource() {
    return this.watchLister.getEventSource();
  }

}
