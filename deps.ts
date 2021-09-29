export * as TOML from "https://deno.land/std@0.105.0/encoding/toml.ts";

export type {
  RestClient as KubernetesClient,
} from "https://deno.land/x/kubernetes_client@v0.3.0/mod.ts";
export {
  autoDetectClient as autoDetectKubernetesClient,
} from "https://deno.land/x/kubernetes_client@v0.3.0/mod.ts";

// from https://github.com/cloudydeno/deno-bitesized :
export {
  ServiceAccount,
} from "https://crux.land/6FyxGX#google-service-account";
export {
  intersection,
  union,
} from "https://crux.land/QGXi9#set-util@v1";

export { runMetricsServer } from "https://deno.land/x/observability@v0.1.1/sinks/openmetrics/server.ts";
export { replaceGlobalFetch } from "https://deno.land/x/observability@v0.1.1/sources/fetch.ts";

//------------
// assemble a customized observables-with-streams export

import { fromIterable } from "https://deno.land/x/stream_observables@v1.2/sources/from-iterable.ts";
import { fromTimer } from "https://deno.land/x/stream_observables@v1.2/sources/from-timer.ts";
import { just } from "https://deno.land/x/stream_observables@v1.2/sources/just.ts";
import { merge } from "https://deno.land/x/stream_observables@v1.2/combiners/merge.ts";
import { map } from "https://deno.land/x/stream_observables@v1.2/transforms/map.ts";
import { debounce } from "https://deno.land/x/stream_observables@v1.2/transforms/debounce.ts";

export const ows = {
  fromIterable,
  fromTimer,
  just,
  merge,
  map,
  debounce,
};
