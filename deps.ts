export * as TOML from "https://deno.land/std@0.88.0/encoding/toml.ts";

export type {
  RestClient as KubernetesClient,
} from "https://deno.land/x/kubernetes_client@v0.2.0/mod.ts";
export {
  autoDetectClient as autoDetectKubernetesClient,
} from "https://deno.land/x/kubernetes_client@v0.2.0/mod.ts";

export {
  ServiceAccount,
} from "https://cloudydeno.github.io/deno-bitesized/integrations/google-service-account@v2.ts";

export {
  runMetricsServer,
} from "https://raw.githubusercontent.com/cloudydeno/deno-openmetrics_exporter/49ce410657ae5cbd9f647acf1233656933a936aa/mod.ts";
export {
  replaceGlobalFetch,
} from "https://raw.githubusercontent.com/cloudydeno/deno-openmetrics_exporter/49ce410657ae5cbd9f647acf1233656933a936aa/lib/instrumented/fetch.ts";

//------------
// assemble a customized observables-with-streams export

import {
  readableStreamFromAsyncIterator as fromAsyncIterator,
} from "https://deno.land/std@0.88.0/io/streams.ts";

import { fromTimer } from "https://cloudydeno.github.io/observables-with-streams/src/sources/from-timer.ts";
import { just } from "https://cloudydeno.github.io/observables-with-streams/src/sources/just.ts";
import { merge } from "https://cloudydeno.github.io/observables-with-streams/src/combiners/merge.ts";
import { map } from "https://cloudydeno.github.io/observables-with-streams/src/transforms/map.ts";
import { debounce } from "https://cloudydeno.github.io/observables-with-streams/src/transforms/debounce.ts";

export const ows = {
  fromAsyncIterator,
  fromTimer,
  just,
  merge,
  map,
  debounce,
};
