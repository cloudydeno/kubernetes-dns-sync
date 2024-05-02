import { ExternaldnsV1alpha1Api, KubernetesClient, log } from '../deps.ts';

import type { CrdSourceConfig } from "../defs/config.ts";
import type { DnsSource, SourceRecord, PlainRecordData } from "../defs/types.ts";

import { transformFromRrdata } from "../lib/dns-rrdata.ts";
import { KubernetesLister } from "../lib/kubernetes-lister.ts";

export class CrdSource implements DnsSource {

  constructor(
    public config: CrdSourceConfig,
    private client: KubernetesClient,
  ) {
    this.crdApi = new ExternaldnsV1alpha1Api(this.client);
  }
  crdApi: ExternaldnsV1alpha1Api;

  lister = new KubernetesLister('DNS CRD',
    opts => this.crdApi.getDNSEndpointListForAllNamespaces({ ...opts }),
    opts => this.crdApi.watchDNSEndpointListForAllNamespaces({ ...opts }),
    {
      annotationFilter: () => this.config.annotation_filter ?? {},
      changeDetectionKeys: res => [res.spec?.endpoints],
    });

  #finalizers = new Map<string, () => Promise<unknown>>();

  async ListRecords() {
    const endpoints = new Array<SourceRecord>();

    for await (const resource of this.lister.getFreshList()) {
      const {name, namespace, generation} = resource.metadata ?? {};
      if (!name || !namespace || !resource.spec?.endpoints) continue;

      const annotations = resource.metadata?.annotations ?? {};
      const resourceKey = `crd/${namespace}/${name}`;

      for (const endp of resource.spec.endpoints) {
        if (!endp.dnsName || !endp.recordType || !endp.targets?.length) continue;

        const endpointAnnotations = { ...annotations };
        // "provider specific" maps directly to annotations
        // e.g. to set cloudflare-proxied:
        // https://github.com/kubernetes-sigs/external-dns/issues/2418#issuecomment-987587518
        for (const entry of endp.providerSpecific ?? []) {
          if (!entry.name || typeof entry.value !== 'string') continue;
          endpointAnnotations[entry.name] = entry.value;
        }

        if (Object.keys(endp.labels ?? {}).length) {
          log.warning(`WARN: CRD 'labels' field is not currently used by dns-sync`);
        }

        const records = new Array<PlainRecordData>();

        for (const target of endp.targets) {
          if (endp.recordType === 'TXT' && !target.startsWith('"')) {
            // If we get an unquoted TXT we treat it as a decoded value instead of rrdata
            records.push({ type: endp.recordType, content: target });
          } else {
            // Treat most things as rrdata, should do the trick
            records.push(transformFromRrdata(endp.recordType as PlainRecordData['type'], target));
          }
        }

        for (const record of records) {
          endpoints.push({
            resourceKey,
            annotations,
            dns: {
              fqdn: endp.dnsName,
              ttl: endp.recordTTL,
              ...record,
            }});
        }
      }

      // Hook a finalizer to mark in the status subresource that we saw the resource
      if (generation && resource.status?.observedGeneration !== generation) {
        resource.status ??= {};
        resource.status.observedGeneration = generation;
        this.#finalizers.set(resourceKey, () => this.crdApi
          .namespace(namespace)
          .replaceDNSEndpointStatus(name, resource)
          .catch(err => log.warning(`Failed to observe DNSEndpoint CRD: ${err.message}`)));
      }

    }
    return endpoints;
  }

  async ObserveResource(resourceKey: string) {
    const finalizer = this.#finalizers.get(resourceKey);
    if (finalizer) {
      this.#finalizers.delete(resourceKey);
      log.debug(`Observing ${resourceKey}`);
      await finalizer();
    }
  }

  MakeEventSource() {
    return this.lister.getEventSource();
  }
}
