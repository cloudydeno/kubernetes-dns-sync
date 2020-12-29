import { AcmeCrdSourceConfig, DnsSource, Endpoint, SplitOutTarget } from "../common/mod.ts";
import { KubernetesClient, Reflector } from '../deps.ts';
import { AcmeCertManagerIoV1Api, Challenge } from "https://deno.land/x/kubernetes_apis@v0.2.0/cert-manager/acme.cert-manager.io%40v1/mod.ts";

/**
 * Special source built specifically for cert-manager's ACME CRDs.
 * To use, create a misconfigured webhook issuer with the solverName `kubernetes-dns-sync`.
 * This source will present challenges for that issuer and update cert-manager's status.
 * Records get cleaned up automatically when cert-manager deletes the Challenge.
 */
export class AcmeCrdSource implements DnsSource {

  constructor(
    public config: AcmeCrdSourceConfig,
    private client: KubernetesClient,
  ) {}
  crdApi = new AcmeCertManagerIoV1Api(this.client);
  requiredAnnotations = Object.entries(this.config.annotation_filter ?? {});

  reflector?: Reflector<Challenge>;
  inSync = false;

  async Endpoints() {
    const endpoints = new Array<Endpoint>();

    const resources = (this.inSync ? this.reflector?.listCached() : null)
      ?? (await this.crdApi.getChallengeListForAllNamespaces()).items;

    ings: for (const challenge of resources) {
      if (!challenge.metadata?.name || !challenge.metadata?.namespace) continue ings;
      if (!challenge.spec.key || !challenge.spec.dnsName) continue ings;
      if (challenge.spec.solver.dns01?.webhook?.solverName !== 'kubernetes-dns-sync') continue ings;

      // TODO: Is this at all useful for Challenge CRs?
      if (this.requiredAnnotations.length > 0) {
        if (!challenge.metadata.annotations) continue ings;
        for (const [key, val] of this.requiredAnnotations) {
          if (challenge.metadata.annotations[key] !== val) continue ings;
        }
      }

      // Allow blocking wildcard domains
      if (challenge.spec.wildcard && this.config.allow_wildcards == false) {
        console.error(`ACME Challenge ${challenge.metadata.namespace}/${challenge.metadata.name} wants to be a wildcard, but that isn't allowed by our configuration`);
        continue ings;
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

  async* MakeEventSource(): AsyncGenerator<void> {
    if (!this.reflector) {
      this.reflector = new Reflector(
        opts => this.crdApi.getChallengeListForAllNamespaces({ ...opts }),
        opts => this.crdApi.watchChallengeListForAllNamespaces({ ...opts }));
      this.reflector.run(); // kinda just toss this away...
    } else {
      console.log(`WARN: Adding another event handler to existing reflector`);
    }

    console.log('observing ACME CRDs...');
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
        case 'DELETED':
          if (this.inSync) yield;
          break;
        case 'MODIFIED':
          if (this.inSync) {
            // Only bother if the spec changes
            // TODO: annotations can also be relevant
            const beforeSpec = JSON.stringify(evt.previous.spec);
            const afterSpec = JSON.stringify(evt.object.spec);
            if (beforeSpec !== afterSpec) yield;
          }
          break;
      }
    }
    console.log('ACME CRD observer done');
  }

}
