export * as TOML from "https://deno.land/std@0.95.0/encoding/toml.ts";

export type {
  RestClient as KubernetesClient,
} from "https://deno.land/x/kubernetes_client@v0.2.3/mod.ts";
export {
  autoDetectClient as autoDetectKubernetesClient,
} from "https://deno.land/x/kubernetes_client@v0.2.3/mod.ts";

// from https://github.com/cloudydeno/deno-bitesized :
export {
  ServiceAccount,
} from "https://crux.land/5D1UrM#google-service-account@v2";

export { runMetricsServer } from "https://deno.land/x/observability@v0.1.0/sinks/openmetrics/server.ts";
export { replaceGlobalFetch } from "https://deno.land/x/observability@v0.1.0/sources/fetch.ts";

//------------
// assemble a customized observables-with-streams export

import { fromIterable } from "https://deno.land/x/stream_observables@v1.0/sources/from-iterable.ts";
import { fromTimer } from "https://deno.land/x/stream_observables@v1.0/sources/from-timer.ts";
import { just } from "https://deno.land/x/stream_observables@v1.0/sources/just.ts";
import { merge } from "https://deno.land/x/stream_observables@v1.0/combiners/merge.ts";
import { map } from "https://deno.land/x/stream_observables@v1.0/transforms/map.ts";
import { debounce } from "https://deno.land/x/stream_observables@v1.0/transforms/debounce.ts";

export const ows = {
  fromIterable,
  fromTimer,
  just,
  merge,
  map,
  debounce,
};
