import {
  autoDetectKubernetesClient,
} from '../deps.ts';

import {
  SourceConfig,
  ProviderConfig,
  RegistryConfig,
} from "../common/mod.ts";

// TODO: consider dynamic imports for all these config-driven imports?

import { IngressSource } from '../sources/ingress.ts';
import { CrdSource } from '../sources/crd.ts';
import { AcmeCrdSource } from '../sources/acme-crd.ts';
import { NodeSource } from '../sources/node.ts';

import { GoogleProvider } from '../providers/google/mod.ts';
import { VultrProvider } from '../providers/vultr/mod.ts';

import { TxtRegistry } from "../registries/txt.ts";
import { NoopRegistry } from "../registries/noop.ts";

const kubernetesClient = await autoDetectKubernetesClient();

// This might be useful for local dev instead of KubectlRaw, which cannot update /status subresources
// import {KubeConfigRestClient, readKubeConfig} from "https://deno.land/x/kubernetes_client@v0.1.3/transports/unstable/via-kubeconfig.ts";
// const kubeConfig = await readKubeConfig();
// kubeConfig.fetchCurrentContext().cluster.server = 'http://localhost:8001';
// const kubernetesClient = new KubeConfigRestClient(kubeConfig, Deno.createHttpClient({}));

export function source(source: SourceConfig) {
  switch (source.type) {
    case 'ingress':
      return new IngressSource(source, kubernetesClient);
    case 'crd':
      return new CrdSource(source, kubernetesClient);
    case 'acme-crd':
      return new AcmeCrdSource(source, kubernetesClient);
    case 'node':
      return new NodeSource(source, kubernetesClient);
    default:
      throw new Error(`Invalid source 'type' ${(source as any).type}`);
  }
};

export function provider(provider: ProviderConfig) {
  switch (provider.type) {
    case 'google':
      return new GoogleProvider(provider);
    case 'vultr':
      return new VultrProvider(provider);
    default:
      throw new Error(`Invalid provider 'type' ${(provider as any).type}`);
  }
};

export function registry(registry: RegistryConfig) {
  switch (registry.type) {
    case 'txt':
      return new TxtRegistry(registry);
    case 'noop':
      return new NoopRegistry(registry);
    default:
      throw new Error(`Invalid registry 'type' ${(registry as any).type}`);
  }
};
