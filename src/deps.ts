export * as TOML from "https://deno.land/std@0.177.0/encoding/toml.ts";
export * as log from "https://deno.land/std@0.177.0/log/mod.ts";

export type {
  RestClient as KubernetesClient,
  WatchEvent,
} from "https://deno.land/x/kubernetes_client@v0.5.0/mod.ts";
export {
  autoDetectClient as autoDetectKubernetesClient,
  Reflector,
} from "https://deno.land/x/kubernetes_client@v0.5.0/mod.ts";

export type { Status, ObjectMeta } from "https://deno.land/x/kubernetes_apis@v0.4.0/builtin/meta@v1/structs.ts";
export { CoreV1Api } from "https://deno.land/x/kubernetes_apis@v0.4.0/builtin/core@v1/mod.ts";
export { NetworkingV1Api } from "https://deno.land/x/kubernetes_apis@v0.4.0/builtin/networking.k8s.io@v1/mod.ts";
export { AcmeCertManagerIoV1Api } from "https://deno.land/x/kubernetes_apis@v0.4.0/cert-manager/acme.cert-manager.io@v1/mod.ts";
export { ExternaldnsV1alpha1Api } from "https://deno.land/x/kubernetes_apis@v0.4.0/external-dns/externaldns.k8s.io@v1alpha1/mod.ts";

export { ApiFactory as AwsApiFactory } from "https://deno.land/x/aws_api@v0.8.1/client/mod.ts";
export * as r53 from "https://aws-api.deno.dev/v0.4/services/route53.ts?actions=ListHostedZones,ListResourceRecordSets,ChangeResourceRecordSets,GetChange";

// from https://github.com/cloudydeno/deno-bitesized :
export {
  ServiceAccount,
} from "https://crux.land/6DifM5#google-service-account";
export * as SetUtil from "https://crux.land/4y3NGo#set-util";

export { runMetricsServer } from "https://deno.land/x/observability@v0.1.2/sinks/openmetrics/server.ts";
export { replaceGlobalFetch } from "https://deno.land/x/observability@v0.1.2/sources/fetch.ts";

//------------
// assemble a customized observables-with-streams export

import { fromIterable } from "https://deno.land/x/stream_observables@v1.3/sources/from-iterable.ts";
import { fromTimer } from "https://deno.land/x/stream_observables@v1.3/sources/from-timer.ts";
import { just } from "https://deno.land/x/stream_observables@v1.3/sources/just.ts";
import { merge } from "https://deno.land/x/stream_observables@v1.3/combiners/merge.ts";
import { map } from "https://deno.land/x/stream_observables@v1.3/transforms/map.ts";
import { debounce } from "https://deno.land/x/stream_observables@v1.3/transforms/debounce.ts";

export const ows = {
  fromIterable,
  fromTimer,
  just,
  merge,
  map,
  debounce,
};
