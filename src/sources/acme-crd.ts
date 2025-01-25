import { AcmeCertManagerIoV1Api, KubernetesClient, log } from '../deps.ts';

import type { AcmeCrdSourceConfig } from "../defs/config.ts";
import type { DnsSource, SourceRecord } from "../defs/types.ts";

import { KubernetesLister } from "../lib/kubernetes-lister.ts";

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

  lister = new KubernetesLister('ACME CRD',
    opts => this.crdApi.getChallengeListForAllNamespaces({ ...opts }),
    opts => this.crdApi.watchChallengeListForAllNamespaces({ ...opts }),
    {
      annotationFilter: () => this.config.annotation_filter ?? {},
      resourceFilter: res => ['kubernetes-dns-sync', 'my-custom-solver'].includes(res.spec.solver.dns01?.webhook?.solverName ?? ''),
      changeDetectionKeys: res => [res.spec.key, res.spec.dnsName, res.spec.wildcard],
    });

  #finalizers = new Map<string, () => Promise<unknown>>();

  async ListRecords() {
    const endpoints = new Array<SourceRecord>();

    for await (const challenge of this.lister.getFreshList()) {
      const {name, namespace, annotations} = challenge.metadata;
      if (!name || !namespace) continue;
      const resourceKey = `acme/${namespace}/${name}`;

      const {key, dnsName, wildcard} = challenge.spec;
      if (!key || !dnsName) continue;

      // Require extra config to allow wildcard domains
      if (wildcard && this.config.allow_wildcards == false) {
        log.warning(`ACME Challenge ${namespace}/${name} is for a wildcard, but that isn't allowed by dns-sync's configuration. Ignoring`);
        continue;
      }

      // Hook a status update as a dns-sync finalizer
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
      log.debug(`Observing ${resourceKey}`);
      await finalizer();
    }
  }

  MakeEventSource() {
    return this.lister.getEventSource();
  }
}
