import { CrdSourceConfig, DnsSource, PlainRecordData, SourceRecord, WatchLister } from "../common/mod.ts";
import { ExternaldnsV1alpha1Api, KubernetesClient } from '../deps.ts';

export class CrdSource implements DnsSource {

  constructor(
    public config: CrdSourceConfig,
    private client: KubernetesClient,
  ) {
    this.crdApi = new ExternaldnsV1alpha1Api(this.client);
  }
  crdApi: ExternaldnsV1alpha1Api;

  watchLister = new WatchLister('CRD',
    opts => this.crdApi.getDNSEndpointListForAllNamespaces({ ...opts }),
    opts => this.crdApi.watchDNSEndpointListForAllNamespaces({ ...opts }),
    crd => [crd.metadata?.annotations, crd.spec]);

  #finalizers = new Map<string, () => Promise<unknown>>();

  async ListRecords() {
    const endpoints = new Array<SourceRecord>();

    for await (const node of this.watchLister.getFreshList(this.config.annotation_filter)) {
      const {name, namespace, generation} = node.metadata ?? {};
      if (!name || !namespace || !node.spec?.endpoints) continue;

      const annotations = node.metadata?.annotations ?? {};
      const resourceKey = `crd/${namespace}/${name}`;

      for (const rule of node.spec.endpoints) {
        if (!rule.dnsName || !rule.recordType || !rule.targets?.length) continue;

        if (rule.providerSpecific?.length) {
          console.error(`WARN: CRD 'providerSpecific' field is not currently used by dns-sync`);
        }
        if (Object.keys(rule.labels ?? {}).length) {
          console.error(`WARN: CRD 'labels' field is not currently used by dns-sync`);
        }

        const records = new Array<PlainRecordData>();
        const type = rule.recordType;
        switch (type) {

          case 'A':
          case 'AAAA':
            for (const target of rule.targets) {
              records.push({ type, target });
            }
            break;

          case 'CNAME':
          case 'NS':
            for (const raw of rule.targets) {
              const target = raw.replace(/\.$/, '');
              records.push({ type, target });
            }
            break;

          case 'TXT':
            for (const content of rule.targets) {
              if (content.startsWith('"')) throw new Error(
                `Looks like ${rule.dnsName} TXT CRD has extra-quoted values`);
              records.push({ type, content });
            }
            break;
        }

        for (const record of records) {
          endpoints.push({
            resourceKey,
            annotations,
            dns: {
              fqdn: rule.dnsName,
              ttl: rule.recordTTL,
              ...record,
            }});
        }
      }

      // mark in status subresource that we saw the record
      // TODO: this probably shouldn't be done until we made the change
      if (generation && node.status?.observedGeneration !== generation) {
        this.#finalizers.set(resourceKey, () => this.crdApi
          .namespace(namespace)
          .replaceDNSEndpointStatus(name, {
            status: {
              observedGeneration: generation,
            }})
          .catch(err => console.warn('Failed to observe DNSEndpoint CRD:', err.message)));
      }

    }
    return endpoints;
  }

  async ObserveResource(resourceKey: string) {
    const finalizer = this.#finalizers.get(resourceKey);
    if (finalizer) {
      this.#finalizers.delete(resourceKey);
      await finalizer();
    }
  }

  MakeEventSource() {
    return this.watchLister.getEventSource();
  }

}
