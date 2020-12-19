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
} from "https://deno.land/x/kubernetes_client@v0.1.0/mod.ts";
export {
  autoDetectClient as autoDetectKubernetesClient,
} from "https://deno.land/x/kubernetes_client@v0.1.0/mod.ts";

// TODO: upstream the changes
export { Reflector } from "./common/streaming.ts";
// export { Reflector } from "https://deno.land/x/kubernetes_apis@v0.1.0/streaming.ts";

// also, things using kubernetes import their necesary API surfaces directly
