import { CoreV1Api, KubernetesClient } from '../deps.ts';

import type { NodeSourceConfig } from "../defs/config.ts";
import type { DnsSource, SourceRecord } from "../defs/types.ts";

import { splitIntoV4andV6 } from "../lib/dns-endpoints.ts";
import { KubernetesLister } from "../lib/kubernetes-lister.ts";

export class NodeSource implements DnsSource {

  constructor(
    public config: NodeSourceConfig,
    private client: KubernetesClient,
  ) {
    this.coreApi = new CoreV1Api(this.client);
    if (!this.config.fqdn_template) throw new Error(
      `The "node" source requires a "fqdn_template" config option.`);
  }
  coreApi: CoreV1Api;

  lister = new KubernetesLister('Node',
    opts => this.coreApi.getNodeList({ ...opts }),
    opts => this.coreApi.watchNodeList({ ...opts }),
    {
      annotationFilter: () => this.config.annotation_filter ?? {},
      changeDetectionKeys: res => [res.status?.addresses],
    });

  async ListRecords() {
    const endpoints = new Array<SourceRecord>();
    const addressType = this.config.address_type || 'ExternalIP';

    for await (const node of this.lister.getFreshList()) {
      if (!node.metadata || !node.status?.addresses) continue;

      // TODO: this is a terrible kludge, I just want to keep some parity with Go to start
      let successful = true; // If a label lookup fails, we skip the node
      const fqdn = this.config.fqdn_template.replace(/{{[^}]+}}/g, tag => {
        const [func, ...args] = tag.slice(2, -2).split(' ');
        if (func === 'index' && args[0] == '.Labels') {
          const value = (node.metadata?.labels ?? {})[args[1].slice(1, -1)] ?? '';
          if (!value) successful = false;
          return value;
        }
        throw new Error(`TODO: Unhandled go tag: ${tag}`);
      }).replace(/\.$/, '');
      if (!successful) continue;

      const addresses = node.status.addresses
        .filter(x => x.type === addressType)
        .map(x => x.address);

      for (const address of splitIntoV4andV6(addresses)) {
        endpoints.push({
          annotations: node.metadata.annotations ?? {},
          resourceKey: `node/${node.metadata.name}`,
          dns: { ...address, fqdn },
        });
      }

    }
    return endpoints;
  }

  MakeEventSource() {
    return this.lister.getEventSource();
  }
}
