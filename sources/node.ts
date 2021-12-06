import { NodeSourceConfig, DnsSource, Endpoint, SplitByIPVersion, WatchLister } from "../common/mod.ts";
import { KubernetesClient } from '../deps.ts';
import { CoreV1Api } from "https://deno.land/x/kubernetes_apis@v0.3.1/builtin/core@v1/mod.ts";

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

  async Endpoints() {
    const endpoints = new Array<Endpoint>();

    for await (const node of this.watchLister.getFreshList(this.config.annotation_filter)) {
      if (!node.metadata || !node.status?.addresses) continue;

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
      }));

    }
    return endpoints;
  }

  MakeEventSource() {
    return this.watchLister.getEventSource();
  }

}
