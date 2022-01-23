import type { ProviderConfig } from "../config.ts";
import { CloudflareProvider } from "./cloudflare/mod.ts";
import { GoogleProvider } from "./google/mod.ts";
import { PowerDnsProvider } from "./powerdns/mod.ts";
import { Route53Provider } from "./route53/mod.ts";
import { VultrProvider } from "./vultr/mod.ts";

export function configureProvider(config: ProviderConfig) {
  switch (config.type) {
    case 'cloudflare':
      return new CloudflareProvider(config);
    case 'google':
      return new GoogleProvider(config);
    case 'route53':
      return new Route53Provider(config);
    case 'vultr':
      return new VultrProvider(config);
    case 'powerdns':
      return new PowerDnsProvider(config);
    default:
      throw new Error(`Invalid provider 'type' ${(config as any).type}`);
  }
};
