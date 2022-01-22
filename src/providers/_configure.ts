import type { ProviderConfig } from "../common/config.ts";
import { GoogleProvider } from "./google/mod.ts";
import { PowerDnsProvider } from "./powerdns/mod.ts";
import { VultrProvider } from "./vultr/mod.ts";

export function configureProvider(config: ProviderConfig) {
  switch (config.type) {
    case 'google':
      return new GoogleProvider(config);
    case 'vultr':
      return new VultrProvider(config);
    case 'powerdns':
      return new PowerDnsProvider(config);
    default:
      throw new Error(`Invalid provider 'type' ${(config as any).type}`);
  }
};
