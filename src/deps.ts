export * as TOML from "https://deno.land/std@0.115.0/encoding/toml.ts";

export type {
  RestClient as KubernetesClient,
  WatchEvent,
} from "https://deno.land/x/kubernetes_client@v0.3.2/mod.ts";
export {
  autoDetectClient as autoDetectKubernetesClient,
  Reflector,
} from "https://deno.land/x/kubernetes_client@v0.3.2/mod.ts";

export type { Status, ObjectMeta } from "https://deno.land/x/kubernetes_apis@v0.3.2/builtin/meta@v1/structs.ts";
export { CoreV1Api } from "https://deno.land/x/kubernetes_apis@v0.3.2/builtin/core@v1/mod.ts";
export { NetworkingV1Api } from "https://deno.land/x/kubernetes_apis@v0.3.2/builtin/networking.k8s.io@v1/mod.ts";
export { AcmeCertManagerIoV1Api } from "https://deno.land/x/kubernetes_apis@v0.3.2/cert-manager/acme.cert-manager.io@v1/mod.ts";
export { ExternaldnsV1alpha1Api } from "https://deno.land/x/kubernetes_apis@v0.3.2/external-dns/externaldns.k8s.io@v1alpha1/mod.ts";

// from https://github.com/cloudydeno/deno-bitesized :
export {
  ServiceAccount,
} from "https://crux.land/CtNDQ#google-service-account";
export {
  intersection,
  union,
} from "https://crux.land/4y3NGo#set-util";
export * as SetUtil from "https://crux.land/4y3NGo#set-util";

export { runMetricsServer } from "https://deno.land/x/observability@v0.1.2/sinks/openmetrics/server.ts";
export { replaceGlobalFetch } from "https://deno.land/x/observability@v0.1.2/sources/fetch.ts";

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
