import { log, ObjectMeta, Reflector, Status, WatchEvent } from "../deps.ts";

type ListOf<T> = { metadata: { resourceVersion?: string | null }; items: Array<T> };

export class KubernetesLister<
  T extends { metadata?: ObjectMeta | null },
> {

  constructor(
    label: string,
    lister: (opts: {}) => Promise<ListOf<T>>,
    watcher: (opts: {}) => Promise<ReadableStream<WatchEvent<T,Status>>>,
    opts: {
      annotationFilter?: () => Record<string, string>,
      resourceFilter?: (resource: T) => boolean,
      changeDetectionKeys?: (resource: T) => Array<unknown>,
    },
  ) {
    this.label = label;
    this.lister = lister;
    this.requiredAnnotationsFunc = opts.annotationFilter ?? (() => ({}));
    this.customFilterFunc = opts.resourceFilter ?? (() => true);
    this.changeFilterKeyFunc = opts.changeDetectionKeys ?? (() => []);

    // TODO: allow for Reflector reuse if multiple sources watch the same Kind
    this.reflector = new Reflector<T, Status>(lister, watcher);
  }
  private isRunning = false;
  public readonly label: string;
  private readonly lister: (opts: {}) => Promise<ListOf<T>>;
  private readonly requiredAnnotationsFunc: () => Record<string, string>;
  private requiredAnnotationsMemo!: Array<[string, string]>;
  private readonly customFilterFunc: (resource: T) => boolean;
  private readonly changeFilterKeyFunc: (resource: T) => Array<unknown>;
  private readonly reflector: Reflector<T, Status>;

  /** Predicate, whether the resource should be returned in list calls */
  private filterResource(res: T) {
    if (!this.requiredAnnotationsMemo) {
      this.requiredAnnotationsMemo = Object.entries(this.requiredAnnotationsFunc() ?? {});
    }
    for (const [key, val] of this.requiredAnnotationsMemo) {
      if (res.metadata?.annotations?.[key] !== val) return false;
    }
    if (this.customFilterFunc) {
      return this.customFilterFunc(res);
    }
    return true;
  }

  /** Predicate, whether the resource has changed in a relevant way, or is still the 'same' */
  private filterChange(before: T, after: T) {
    const beforeWanted = this.filterResource(before);
    const afterWanted = this.filterResource(after);
    if (beforeWanted != afterWanted) return true;

    const beforeSpec = JSON.stringify(this.changeFilterKeyFunc(before));
    const afterSpec = JSON.stringify(this.changeFilterKeyFunc(after));
    if (beforeSpec != afterSpec) return true;

    const beforeAnnotations = JSON.stringify(selectControllerAnnotations(before.metadata?.annotations));
    const afterAnnotations = JSON.stringify(selectControllerAnnotations(after.metadata?.annotations));
    if (beforeAnnotations != afterAnnotations) return true;

    return false;
  }

  /** Helper used during one-shot runs (that is, no active Reflector) */
  private async listFromUpstream() {
    const {items} = await this.lister({});
    log.debug(`WatchLister for ${this.label} listed upstream`);
    return items;
  }


  public async* getFreshList() {
    const resources =
      (this.reflector.isSynced()
        ? this.reflector.listCached()
        : null)
      ?? await this.listFromUpstream();

    for (const resource of resources) {
      if (!resource.metadata?.name) continue;
      if (this.filterResource(resource)) {
        yield resource;
      }
    }
  }

  public async* getEventSource(): AsyncGenerator<void> {
    if (!this.isRunning) {
      this.reflector.run(); // kinda just toss this away...
      this.isRunning = true;
    } else {
      log.warn(`Adding another event handler to existing WatchLister for ${this.label}`);
    }

    log.info(`Observing ${this.label}...`);
    let inSync = false;
    for await (const evt of this.reflector.observeAll()) {
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
          // Only bother if specific parts change
          if (inSync && this.filterChange(evt.previous, evt.object)) {
            yield;
          }
          break;
      }
    }
    log.debug(`Done observing ${this.label}`);
  }
}

function selectControllerAnnotations(annotations: Record<string,string> | null | undefined) {
  if (!annotations) return [];
  return Object.entries(annotations ?? {})
    // TODO: probably add another prefix if we defined our own annotations too
    .filter(x => x[0].startsWith('external-dns.alpha.kubernetes.io/'))
    .sort((a,b) => a[0].localeCompare(b[0]));
}
