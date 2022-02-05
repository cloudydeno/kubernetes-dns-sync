import { ExternaldnsV1alpha1Api, KubernetesClient, log } from '../deps.ts';

import type { CrdSourceConfig } from "../defs/config.ts";
import type { DnsSource, SourceRecord, PlainRecordData } from "../defs/types.ts";
import { WatchLister } from "../lib/watch-lister.ts";
import { transformFromRrdata } from "../lib/dns-rrdata.ts";

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
          log.warning(`WARN: CRD 'providerSpecific' field is not currently used by dns-sync`);
        }
        if (Object.keys(rule.labels ?? {}).length) {
          log.warning(`WARN: CRD 'labels' field is not currently used by dns-sync`);
        }

        const records = new Array<PlainRecordData>();

        for (const target of rule.targets) {
          if (rule.recordType === 'TXT' && !target.startsWith('"')) {
            // If we get an unquoted TXT we treat it as a decoded value instead of rrdata
            records.push({ type: rule.recordType, content: target });
          } else {
            // Treat most things as rrdata, should do the trick
            records.push(transformFromRrdata(rule.recordType as PlainRecordData['type'], target));
          }
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
    return this.watchLister.getEventSource();
  }

}
