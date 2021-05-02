import { AcmeCrdSourceConfig, DnsSource, Endpoint, SplitOutTarget, WatchLister } from "../common/mod.ts";
import { KubernetesClient } from '../deps.ts';
import { AcmeCertManagerIoV1Api } from "https://deno.land/x/kubernetes_apis@v0.3.0/cert-manager/acme.cert-manager.io@v1/mod.ts";

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

  async Endpoints() {
    const endpoints = new Array<Endpoint>();

    for await (const challenge of this.watchLister.getFreshList(this.config.annotation_filter)) {
      if (!challenge.metadata?.name || !challenge.metadata?.namespace) continue;
      if (!challenge.spec.key || !challenge.spec.dnsName) continue;
      // How we know which Challenges are for us...
      if (challenge.spec.solver.dns01?.webhook?.solverName !== 'kubernetes-dns-sync') continue;

      // Require extra config to allow wildcard domains
      if (challenge.spec.wildcard && this.config.allow_wildcards == false) {
        console.error(`ACME Challenge ${challenge.metadata.namespace}/${challenge.metadata.name} is for a wildcard, which isn't allowed by our configuration`);
        continue;
      }

      // TODO: this shouldn't be done until we made the change
      if (challenge.status?.state == 'pending' && challenge.status?.processing && !challenge.status?.presented) {
        challenge.status.presented = true;
        challenge.status.reason = 'kubernetes-dns-sync accepted record';

        await this.crdApi
          .namespace(challenge.metadata.namespace)
          .replaceChallengeStatus(challenge.metadata.name, challenge);
      }

      // Furnish the verification record
      endpoints.push({
        DNSName: '_acme-challenge.' + challenge.spec.dnsName,
        RecordType: 'TXT',
        Targets: [challenge.spec.key],
        Labels: {
          'external-dns/resource': `acme/${challenge.metadata.namespace}/${challenge.metadata.name}`,
        },
        RecordTTL: this.config.challenge_ttl ?? undefined,
        SplitOutTarget,
      });
    }
    return endpoints;
  }

  MakeEventSource() {
    return this.watchLister.getEventSource();
  }

}
