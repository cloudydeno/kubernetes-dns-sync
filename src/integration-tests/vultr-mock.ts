import type { RegistryConfig, VultrProviderConfig } from "../defs/config.ts";
import type { SourceRecord } from "../defs/types.ts";

import { VultrApiMock } from "../providers/vultr/mock.ts";
import { VultrProvider } from "../providers/vultr/mod.ts";
import { configureRegistry } from "../registries/_configure.ts";
import { applyToProvider } from "./apply.ts";

export function mockedVultrTest(opts: {
  registry: RegistryConfig,
  provider?: Partial<VultrProviderConfig>,
  vultr?: VultrApiMock,
  // vultrRecords?: DnsRecordData[],
  sourceRecords: Array<SourceRecord>,
}) {

  const registry = configureRegistry(opts.registry);
  const apiMock = opts.vultr ?? new VultrApiMock();
  const provider = new VultrProvider({
    type: 'vultr',
    ...opts.provider,
  }, apiMock);

  return {
    withZone(...a: Parameters<typeof apiMock.addMockedZone>) {
      apiMock.addMockedZone(...a);
      return this;
    },
    withDeadZone(...a: Parameters<typeof apiMock.addMockedDeadZone>) {
      apiMock.addMockedDeadZone(...a);
      return this;
    },
    async go() {
      await applyToProvider(provider, registry, opts.sourceRecords);
      apiMock.verifyCompletion();
    },
  };
}
