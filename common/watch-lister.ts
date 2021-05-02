import { Status, ObjectMeta } from "https://deno.land/x/kubernetes_apis@v0.3.0/builtin/meta@v1/structs.ts";
import { Reflector, WatchEvent } from "https://deno.land/x/kubernetes_client@v0.2.3/mod.ts";

type ListOf<T> = { metadata: { resourceVersion?: string | null }; items: Array<T> };

export class WatchLister<T extends {metadata?: ObjectMeta | null }> extends Reflector<T, Status> {

  isRunning = false;

  constructor(
    public label: string,
    private lister: (opts: {}) => Promise<ListOf<T>>,
    watcher: (opts: {}) => Promise<ReadableStream<WatchEvent<T,Status>>>,
    private changeFilterKeyFunc?: (node: T) => unknown,
  ) {
    super(lister, watcher);
  }

  private async listFromUpstream() {
    const {items} = await this.lister({});
    console.log('INFO: Reflector for', this.label, 'listed upstream');
    return items;
  }

  async* getFreshList(annotationFilter?: Record<string,string>) {
    const requiredAnnotations = annotationFilter ? Object.entries(annotationFilter) : [];

    const resources =
      (this.isSynced()
        ? this.listCached()
        : null)
      ?? await this.listFromUpstream();

    loop: for (const node of resources) {
      if (!node.metadata?.name) continue loop;

      if (requiredAnnotations.length > 0) {
        if (!node.metadata.annotations) continue loop;
        for (const [key, val] of requiredAnnotations) {
          if (node.metadata.annotations[key] !== val) continue loop;
        }
      }

      yield node;
    }
  }

  async* getEventSource(): AsyncGenerator<void> {
    if (!this.isRunning) {
      this.run(); // kinda just toss this away...
      this.isRunning = true;
    } else {
      console.log(`WARN: Adding another event handler to existing WatchLister for ${this.label}`);
    }

    console.log(`Observing ${this.label}...`);
    let inSync = false;
    for await (const evt of this.observeAll()) {
      switch (evt.type) {
        case 'SYNCED':
          yield;
          inSync = true; // start allowing falling-edge runs
          break;
        case 'DESYNCED':
          inSync = false; // block runs during resync inconsistencies
          break;
        case 'ADDED':
        case 'DELETED':
          if (inSync) yield;
          break;
        case 'MODIFIED':
          if (!inSync) break;
          if (this.changeFilterKeyFunc) {
            // Only bother if specific parts change
            const beforeSpec = JSON.stringify(this.changeFilterKeyFunc(evt.previous));
            const afterSpec = JSON.stringify(this.changeFilterKeyFunc(evt.object));
            if (beforeSpec === afterSpec) break;
          }
          yield;
          break;
      }
    }
    console.log(`Done observing ${this.label}`);
  }
}
