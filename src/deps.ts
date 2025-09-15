export * as TOML from "@std/toml";
export * as log from "@std/log";

export type {
  RestClient as KubernetesClient,
  WatchEvent,
} from "@cloudydeno/kubernetes-client";
export {
  autoDetectClient as autoDetectKubernetesClient,
  Reflector,
} from "@cloudydeno/kubernetes-client";

export type { Status, ObjectMeta } from "@cloudydeno/kubernetes-apis/meta/v1";
export { CoreV1Api } from "@cloudydeno/kubernetes-apis/core/v1";
export { NetworkingV1Api } from "@cloudydeno/kubernetes-apis/networking.k8s.io/v1";
export { AcmeCertManagerIoV1Api } from "@cloudydeno/kubernetes-apis/acme.cert-manager.io/v1";
export { ExternaldnsV1alpha1Api } from "@cloudydeno/kubernetes-apis/externaldns.k8s.io/v1alpha1";

export { ApiFactory as AwsApiFactory } from "@cloudydeno/aws-api/client";
export * as r53 from "./aws-api/route53.ts";

export {
  ServiceAccount,
  type ServiceAccountApi,
} from "@cloudydeno/bitesized/integrations/google-service-account";

//------------
// assemble a customized observables-with-streams export

import { fromIterable } from "@cloudydeno/stream-observables/sources/from-iterable.ts";
import { fromTimer } from "@cloudydeno/stream-observables/sources/from-timer.ts";
import { just } from "@cloudydeno/stream-observables/sources/just.ts";
import { merge } from "@cloudydeno/stream-observables/combiners/merge.ts";
import { map } from "@cloudydeno/stream-observables/transforms/map.ts";
import { debounce } from "@cloudydeno/stream-observables/transforms/debounce.ts";

export const ows = {
  fromIterable,
  fromTimer,
  just,
  merge,
  map,
  debounce,
};
