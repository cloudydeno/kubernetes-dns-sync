export interface ControllerConfig {
  interval_seconds?: number;
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
export interface NodeSourceConfig extends SourceConfigBase {
  type: "node";
  address_type: string;
  fqdn_template: string;
}
export type SourceConfig =
| IngressSourceConfig
| CrdSourceConfig
| NodeSourceConfig
;

export interface GoogleProviderConfig {
  type: "google";
}
export interface VultrProviderConfig {
  type: "vultr";
}
export type ProviderConfig =
| GoogleProviderConfig
| VultrProviderConfig
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
