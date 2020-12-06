import { NodeSourceConfig, DnsSource, Endpoint, SplitOutTarget, SplitByIPVersion } from "../common/mod.ts";

import { RestClient } from "https://deno.land/x/kubernetes_client@v0.1.0/mod.ts";
import { CoreV1Api } from "https://deno.land/x/kubernetes_apis@v0.1.0/builtin/core@v1/mod.ts";

export class NodeSource implements DnsSource {

  constructor(
    public config: NodeSourceConfig,
    private client: RestClient,
  ) {}
  coreApi = new CoreV1Api(this.client);
  requiredAnnotations = Object.entries(this.config.annotation_filter ?? {});

  async Endpoints() {
    const endpoints = new Array<Endpoint>();

    nodes: for (const node of (await this.coreApi.getNodeList()).items) {
      if (!node.metadata || !node.status?.addresses) continue nodes;

      if (this.requiredAnnotations.length > 0) {
        if (!node.metadata.annotations) continue nodes;
        for (const [key, val] of this.requiredAnnotations) {
          if (node.metadata.annotations[key] !== val) continue nodes;
        }
      }

      // TODO: this is a terrible kludge, I just want to keep some parity with Go to start
      const fqdn = this.config.fqdn_template.replace(/{{[^}]+}}/g, tag => {
        const [func, ...args] = tag.slice(2, -2).split(' ');
        if (func === 'index' && args[0] == '.Labels') {
          return (node.metadata?.labels ?? {})[args[1].slice(1, -1)] ?? '';
        }
        throw new Error(`TODO: Unhandled go tag: ${tag}`);
      });
      const addresses = node.status.addresses
        .filter(x => x.type === this.config.address_type)
        .map(x => x.address);

      endpoints.push(...SplitByIPVersion({
        DNSName: fqdn,
        RecordType: 'A',
        Targets: addresses,
        Labels: {
          'external-dns/resource': `node/${node.metadata.name}`,
        },
        SplitOutTarget,
      }));

    }
    return endpoints;
  }

  AddEventHandler(cb: () => void) {
    throw new Error("Method not implemented.");
  }

}
