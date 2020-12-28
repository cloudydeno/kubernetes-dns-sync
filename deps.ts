export {
  readableStreamFromAsyncIterator as fromAsyncIterator,
} from "https://deno.land/std@0.81.0/io/streams.ts";
export * as TOML from 'https://deno.land/std@0.81.0/encoding/toml.ts';

export { fromTimer } from "https://uber.danopia.net/deno/observables-with-streams@v1/sources/from-timer.ts";
export { just } from "https://uber.danopia.net/deno/observables-with-streams@v1/sources/just.ts";
export { merge } from "https://uber.danopia.net/deno/observables-with-streams@v1/combiners/merge.ts";
// export { merge } from "/code/danopia/observables-with-streams/src/combiners/merge.ts";
export { map } from "https://uber.danopia.net/deno/observables-with-streams@v1/transforms/map.ts";
export { debounce } from "https://uber.danopia.net/deno/observables-with-streams@v1/transforms/debounce.ts";

export type {
  RestClient as KubernetesClient,
} from "https://deno.land/x/kubernetes_client@v0.1.2/mod.ts";
export {
  autoDetectClient as autoDetectKubernetesClient,
} from "https://deno.land/x/kubernetes_client@v0.1.2/mod.ts";

import { Status } from "https://raw.githubusercontent.com/danopia/deno-kubernetes_apis/f542e66d229afd296c7af3820d254f8cd07d3c43/lib/builtin/meta@v1/structs.ts";
import { Reflector as GenericReflector } from "https://deno.land/x/kubernetes_client@v0.1.2/mod.ts";
export class Reflector<T> extends GenericReflector<T, Status> {}

// also, things using kubernetes import their necesary API surfaces directly
