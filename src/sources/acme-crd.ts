import { AcmeCertManagerIoV1Api, KubernetesClient } from '../deps.ts';

import type { AcmeCrdSourceConfig } from "../common/config.ts";
import type { DnsSource, SourceRecord } from "../common/contract.ts";
import { WatchLister } from "../common/watch-lister.ts";

/**
 * Special source built specifically for cert-manager's ACME CRDs.
 * To use, create a misconfigured webhook issuer with the solverName `kubernetes-dns-sync`.
 * This source will present challenges for that issuer and update cert-manager's status.
 * Records get cleaned up automatically after cert-manager deletes the Challenge.
 */
export class AcmeCrdSource implements DnsSource {

  constructor(
    public config: AcmeCrdSourceConfig,
    private client: KubernetesClient,
  ) {
    this.crdApi = new AcmeCertManagerIoV1Api(this.client);
  }
  crdApi: AcmeCertManagerIoV1Api;

  watchLister = new WatchLister('ACME CRD',
    opts => this.crdApi.getChallengeListForAllNamespaces({ ...opts }),
    opts => this.crdApi.watchChallengeListForAllNamespaces({ ...opts }),
    crd => [crd.metadata?.annotations, crd.spec]);

  #finalizers = new Map<string, () => Promise<unknown>>();

  async ListRecords() {
    const endpoints = new Array<SourceRecord>();

    for await (const challenge of this.watchLister.getFreshList(this.config.annotation_filter)) {
      const {name, namespace, annotations} = challenge.metadata;
      if (!name || !namespace) continue;

      const {key, dnsName, solver, wildcard} = challenge.spec;
      if (!key || !dnsName) continue;

      // How we know which Challenges are for us...
      if (solver.dns01?.webhook?.solverName !== 'kubernetes-dns-sync') continue;

      const resourceKey = `acme/${namespace}/${name}`;

      // Require extra config to allow wildcard domains
      if (wildcard && this.config.allow_wildcards == false) {
        console.error(`ACME Challenge ${namespace}/${name} is for a wildcard, but that isn't allowed by dns-sync's configuration`);
        continue;
      }

      // TODO: this shouldn't be done until we made the change
      if (challenge.status?.state == 'pending' && challenge.status?.processing && !challenge.status?.presented) {
        challenge.status.presented = true;
        challenge.status.reason = 'kubernetes-dns-sync accepted record';
        this.#finalizers.set(resourceKey, () => this.crdApi
          .namespace(namespace)
          .replaceChallengeStatus(name, challenge));
      }

      // Furnish the verification record
      endpoints.push({
        resourceKey,
        annotations: annotations ?? {},
        dns: {
          type: 'TXT',
          content: key,
          fqdn: `_acme-challenge.${dnsName.replace(/\.$/, '')}`,
          ttl: this.config.challenge_ttl,
        }});
    }
    return endpoints;
  }

  async ObserveResource(resourceKey: string) {
    const finalizer = this.#finalizers.get(resourceKey);
    if (finalizer) {
      this.#finalizers.delete(resourceKey);
      console.debug('   ', 'Observing', resourceKey);
      await finalizer();
    }
  }

  MakeEventSource() {
    return this.watchLister.getEventSource();
  }

}
