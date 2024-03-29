export interface ControllerConfig {
  interval_seconds?: number;
  debounce_seconds?: number;
  disable_watching?: boolean;

  source: SourceConfig[];
  provider: ProviderConfig[];
  registry: RegistryConfig;
}
export function isControllerConfig(raw: unknown): raw is ControllerConfig {
  if (raw == null || Array.isArray(raw) || typeof raw !== 'object') return false;
  const data = raw as Record<string,unknown>;
  // const {source, provider, registry} = data;

  if (data.interval_seconds !== undefined && typeof data.interval_seconds !== 'number') return false;

  if (!Array.isArray(data['source'])) return false;
  if (data['source'].some(x => typeof x.type !== 'string')) return false;

  if (!Array.isArray(data['provider'])) return false;
  if (data['provider'].some(x => typeof x.type !== 'string')) return false;

  if (typeof data.registry !== 'object' || data.registry == null) return false;
  if (typeof (data.registry as any).type !== 'string') return false;

  return true;
}

export interface SourceConfigBase {
  annotation_filter?: Record<string,string>;
}
export interface IngressSourceConfig extends SourceConfigBase {
  type: "ingress";
  ingress_class_names?: Array<string>;
}
export interface CrdSourceConfig extends SourceConfigBase {
  type: "crd";
}
export interface AcmeCrdSourceConfig extends SourceConfigBase {
  type: "acme-crd";
  challenge_ttl?: number;
  allow_wildcards?: boolean;
}
export interface NodeSourceConfig extends SourceConfigBase {
  type: "node";
  address_type: string;
  fqdn_template: string;
}
export type SourceConfig =
| IngressSourceConfig
| CrdSourceConfig
| AcmeCrdSourceConfig
| NodeSourceConfig
;

export interface CloudflareProviderConfig {
  type: "cloudflare";
  proxied_by_default?: boolean;
  allow_proxied_wildcards?: boolean; // true requires an Enterprise plan
  // These let you give specific IDs instead of finding what you can access
  account_id?: string;
  zone_id_filter?: string[];
  // This filters the list of zones that was found
  domain_filter?: string[];
}
export interface Route53ProviderConfig {
  type: "route53";
  // route53 is a global service, in us-east-1, but it's configurable here anyway
  region?: string;
  // These filter the list of zones that was found
  zone_id_filter?: string[];
  domain_filter?: string[];
}
export interface GoogleProviderConfig {
  type: "google";
  project_id?: string;
  domain_filter?: string[];
  zone_filter?: string[];
}
export interface VultrProviderConfig {
  type: "vultr";
  domain_filter?: string[];
}
export interface PowerDnsProviderConfig {
  type: "powerdns";
  api_endpoint?: string;
  server_id?: string;
  domain_filter?: string[];
  // send_dns_notify?: boolean;
  // rectify_dnssec?: boolean;
}
export type ProviderConfig =
| CloudflareProviderConfig
| GoogleProviderConfig
| Route53ProviderConfig
| VultrProviderConfig
| PowerDnsProviderConfig
;

export interface TxtRegistryConfig {
  type: "txt";
  txt_prefix?: string;
  txt_suffix?: string;
  txt_owner_id: string;
  auto_adopt_from_owner_ids?: string[];
  // auto_import?: boolean;
}
export interface NoopRegistryConfig {
  type: "noop";
}
export type RegistryConfig =
| TxtRegistryConfig
| NoopRegistryConfig
;
