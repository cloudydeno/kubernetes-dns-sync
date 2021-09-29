export interface ControllerConfig {
  interval_seconds?: number;
  debounce_seconds?: number;
  enable_watching?: boolean;

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
| GoogleProviderConfig
| VultrProviderConfig
| PowerDnsProviderConfig
;

export interface TxtRegistryConfig {
  type: "txt";
  txt_prefix?: string;
  txt_suffix?: string;
  txt_owner_id: string;
  auto_import?: boolean;
}
export interface NoopRegistryConfig {
  type: "noop";
}
export type RegistryConfig =
| TxtRegistryConfig
| NoopRegistryConfig
;
