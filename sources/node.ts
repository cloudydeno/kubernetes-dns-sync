import { NodeSourceConfig, DnsSource, Endpoint, SplitOutTarget, SplitByIPVersion } from "../common/mod.ts";
import { KubernetesClient, Reflector } from '../deps.ts';
import { CoreV1Api, NodeFields } from "https://deno.land/x/kubernetes_apis@v0.1.0/builtin/core@v1/mod.ts";

export class NodeSource implements DnsSource {

  constructor(
    public config: NodeSourceConfig,
    private client: KubernetesClient,
  ) {}
  coreApi = new CoreV1Api(this.client);
  requiredAnnotations = Object.entries(this.config.annotation_filter ?? {});

  reflector?: Reflector<NodeFields>;
  inSync = false;

  async Endpoints() {
    const endpoints = new Array<Endpoint>();

    const resources = (this.inSync ? this.reflector?.listCached() : null)
      ?? (await this.coreApi.getNodeList()).items;

    nodes: for (const node of resources) {
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

  async* MakeEventSource(): AsyncGenerator<void> {
    if (!this.reflector) {
      this.reflector = new Reflector(
        opts => this.coreApi.getNodeList({ ...opts }),
        opts => this.coreApi.watchNodeList({ ...opts }));
      this.reflector.run(); // kinda just toss this away...
    } else {
      console.log(`WARN: Adding another event handler to existing reflector`);
    }

    console.log('observing Nodes...');
    this.inSync = false;
    for await (const evt of this.reflector.observeAll()) {
      switch (evt.type) {
        case 'SYNCED':
          yield; // always
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
            // Only bother if the node addresses change
            // TODO: annotations can also be relevant
            const beforeAddrs = JSON.stringify(evt.previous.status?.addresses);
            const afterAddrs = JSON.stringify(evt.object.status?.addresses);
            console.log(beforeAddrs);
            console.log(afterAddrs);
            if (beforeAddrs !== afterAddrs) yield;
          }
          break;
      }
    }
    console.log('Node observer done');
  }

}
