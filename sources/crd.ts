import { CrdSourceConfig, DnsSource, Endpoint, SplitOutTarget, SplitByIPVersion } from "../common/mod.ts";

import { RestClient } from "https://deno.land/x/kubernetes_client@v0.1.0/mod.ts";
import { ExternaldnsV1alpha1Api } from "https://uber.danopia.net/deno/gke-apis/externaldns.k8s.io@v1alpha1/mod.ts";

export class CrdSource implements DnsSource {

  constructor(
    public config: CrdSourceConfig,
    private client: RestClient,
  ) {}
  crdApi = new ExternaldnsV1alpha1Api(this.client);
  requiredAnnotations = Object.entries(this.config.annotation_filter ?? {});

  async Endpoints() {
    const endpoints = new Array<Endpoint>();

    ings: for (const node of (await this.crdApi.getDNSEndpointListForAllNamespaces()).items) {
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

    }
    return endpoints;
  }

  AddEventHandler(cb: () => void): void {
    throw new Error("Method not implemented.");
  }

}
