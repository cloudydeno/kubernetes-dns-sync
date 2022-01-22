import { RegistryConfig, VultrProviderConfig } from "../common/config.ts";
import { SourceRecord } from "../common/contract.ts";
import { VultrApiMock } from "../providers/vultr/mock.ts";
import { VultrProvider } from "../providers/vultr/mod.ts";
import { applyToProvider } from "./apply.ts";
import * as configure from "../controller/configure.ts";

export function mockedVultrTest(opts: {
  registry: RegistryConfig,
  provider?: Partial<VultrProviderConfig>,
  vultr?: VultrApiMock,
  // vultrRecords?: DnsRecordData[],
  sourceRecords: Array<SourceRecord>,
}) {

  const registry = configure.registry(opts.registry);
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
