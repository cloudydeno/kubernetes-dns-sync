import { CoreV1Api, KubernetesClient } from '../deps.ts';

import type { NodeSourceConfig } from "../defs/config.ts";
import type { DnsSource, SourceRecord } from "../defs/types.ts";
import { WatchLister } from "../lib/watch-lister.ts";

import { splitIntoV4andV6 } from "../lib/dns-endpoints.ts";

export class NodeSource implements DnsSource {

  constructor(
    public config: NodeSourceConfig,
    private client: KubernetesClient,
  ) {
    this.coreApi = new CoreV1Api(this.client);
  }
  coreApi: CoreV1Api;

  watchLister = new WatchLister('Node',
    opts => this.coreApi.getNodeList({ ...opts }),
    opts => this.coreApi.watchNodeList({ ...opts }),
    node => [node.status?.addresses]); // TODO: also annotations (but only the ones we watch!)

  async ListRecords() {
    const endpoints = new Array<SourceRecord>();

    for await (const node of this.watchLister.getFreshList(this.config.annotation_filter)) {
      if (!node.metadata || !node.status?.addresses) continue;

      // TODO: this is a terrible kludge, I just want to keep some parity with Go to start
      const fqdn = this.config.fqdn_template.replace(/{{[^}]+}}/g, tag => {
        const [func, ...args] = tag.slice(2, -2).split(' ');
        if (func === 'index' && args[0] == '.Labels') {
          return (node.metadata?.labels ?? {})[args[1].slice(1, -1)] ?? '';
        }
        throw new Error(`TODO: Unhandled go tag: ${tag}`);
      }).replace(/\.$/, '');

      const addresses = node.status.addresses
        .filter(x => x.type === this.config.address_type)
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
    return this.watchLister.getEventSource();
  }

}
