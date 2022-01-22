import { KubernetesClient, autoDetectKubernetesClient } from "../deps.ts";

import type { SourceConfig } from "../config.ts";
import { AcmeCrdSource } from "./acme-crd.ts";
import { CrdSource } from "./crd.ts";
import { IngressSource } from "./ingress.ts";
import { NodeSource } from "./node.ts";

let kubernetesPromise: Promise<KubernetesClient> | null = null;
function getKubernetesClient() {
  return kubernetesPromise ??= autoDetectKubernetesClient();
}

export async function configureSource(config: SourceConfig) {
  switch (config.type) {
    case 'ingress':
      return new IngressSource(config, await getKubernetesClient());
    case 'crd':
      return new CrdSource(config, await getKubernetesClient());
    case 'acme-crd':
      return new AcmeCrdSource(config, await getKubernetesClient());
    case 'node':
      return new NodeSource(config, await getKubernetesClient());
    default:
      throw new Error(`Invalid source 'type' ${(config as any).type}`);
  }
};
