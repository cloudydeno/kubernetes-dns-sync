import { Endpoint } from "./contract.ts";

/// Basic function for non-special cases
export function SplitOutTarget(this: Endpoint, predicate: (t: string) => boolean): [Endpoint, Endpoint] {
  return [{
    ...this,
    Targets: this.Targets.filter(predicate),
  }, {
    ...this,
    Targets: this.Targets.filter(x => !predicate(x)),
  }];
}

export function SplitByIPVersion(all: Endpoint): Endpoint[] {
  const [aaaa, a] = all.SplitOutTarget(t => t.includes(':'));
  const endpoints = new Array<Endpoint>();
  if (aaaa.Targets.length > 0) {
    aaaa.RecordType = 'AAAA';
    endpoints.push(aaaa);
  }
  if (a.Targets.length > 0) {
    a.RecordType = 'A';
    endpoints.push(a);
  }
  return endpoints;
}
