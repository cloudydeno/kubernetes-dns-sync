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
// import { PowerDnsProvider } from "../providers/powerdns/mod.ts";

import { TxtRegistry } from "../registries/txt.ts";
import { NoopRegistry } from "../registries/noop.ts";

const kubernetesClient = await autoDetectKubernetesClient();

export function source(config: SourceConfig) {
  switch (config.type) {
    case 'ingress':
      return new IngressSource(config, kubernetesClient);
    case 'crd':
      return new CrdSource(config, kubernetesClient);
    case 'acme-crd':
      return new AcmeCrdSource(config, kubernetesClient);
    case 'node':
      return new NodeSource(config, kubernetesClient);
    default:
      throw new Error(`Invalid source 'type' ${(config as any).type}`);
  }
};

export function provider(config: ProviderConfig) {
  switch (config.type) {
    case 'google':
      return new GoogleProvider(config);
    case 'vultr':
      return new VultrProvider(config);
    // case 'powerdns':
    //   return new PowerDnsProvider(config);
    default:
      throw new Error(`Invalid provider 'type' ${(config as any).type}`);
  }
};

export function registry(config: RegistryConfig) {
  switch (config.type) {
    case 'txt':
      return new TxtRegistry(config);
    case 'noop':
      return new NoopRegistry(config);
    default:
      throw new Error(`Invalid registry 'type' ${(config as any).type}`);
  }
};
