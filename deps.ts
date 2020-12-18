export { readableStreamFromAsyncIterator } from "https://deno.land/std@0.81.0/io/streams.ts";
export { MuxAsyncIterator } from "https://deno.land/std@0.81.0/async/mux_async_iterator.ts";
export * as TOML from 'https://deno.land/std@0.81.0/encoding/toml.ts';

export { debounce } from "https://raw.githubusercontent.com/danopia/observables-with-streams/063d7c7e5d91e981036e5cdae44c1534e718fe97/src/transforms/debounce.ts";

// TODO: replace with more observables!
export { fixedInterval } from 'https://danopia.net/deno/fixed-interval@v1.ts';

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
