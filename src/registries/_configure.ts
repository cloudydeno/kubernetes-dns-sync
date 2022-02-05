import type { RegistryConfig } from "../defs/config.ts";
import { NoopRegistry } from "./noop.ts";
import { TxtRegistry } from "./txt.ts";

export function configureRegistry(config: RegistryConfig) {
  switch (config.type) {
    case 'txt':
      return new TxtRegistry(config);
    case 'noop':
      return new NoopRegistry(config);
    default:
      throw new Error(`Invalid registry 'type' ${(config as RegistryConfig).type}`);
  }
};
