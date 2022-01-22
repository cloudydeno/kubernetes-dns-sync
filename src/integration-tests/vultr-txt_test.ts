import { VultrProvider } from "../providers/vultr/mod.ts";
import { VultrApiMock } from "../providers/vultr/mock.ts";
import { TxtRegistry } from "../registries/txt.ts";
import { applyToProvider } from "../common/test-utils.ts";
import { SourceRecord } from "../common/contract.ts";
import type { TxtRegistryConfig, VultrProviderConfig } from "../common/config.ts";

Deno.test("[E2E: Vultr & TXT] Keep unchanged A record",
  async () => await mockedVultrTest({
    sourceRecords: [{
      annotations: {},
      resourceKey: 'e2e',
      dns: {
        fqdn: "www.example.com",
        type: "A",
        target: '1.1.1.1',
      },
    }],
  }).withZone('example.com', [{
    expect: 'retained',
    data: { name: 'www', type: 'A', data: '1.1.1.1' },
  }, {
    expect: 'retained',
    data: { name: 'www', type: 'TXT', data:
      '"heritage=external-dns,external-dns/owner=dnssynctest,external-dns/resource=e2e,record-type/A=managed"' },
  }]).go());

Deno.test("[E2E: Vultr & TXT] Update unscoped registry record",
  async () => await mockedVultrTest({
    sourceRecords: [{
      annotations: {},
      resourceKey: 'e2e',
      dns: {
        fqdn: "www.example.com",
        type: "A",
        target: '1.1.1.1',
      },
    }],
  }).withZone('example.com', [{
    expect: 'retained',
    data: { name: 'www', type: 'A', data: '1.1.1.1' },
  }, {
    expect: 'deletion',
    data: { name: 'www', type: 'TXT', data:
      '"heritage=external-dns,external-dns/owner=dnssynctest"' },
  }, {
    expect: 'creation',
    data: { name: 'www', type: 'TXT', data:
      '"heritage=external-dns,external-dns/owner=dnssynctest,external-dns/resource=e2e,record-type/A=managed"' },
  }]).go());

Deno.test("[E2E: Vultr & TXT] Update outdated registry record",
  async () => await mockedVultrTest({
    sourceRecords: [{
      annotations: {},
      resourceKey: 'e2e',
      dns: {
        fqdn: "www.example.com",
        type: "A",
        target: '1.1.1.1',
      },
    }],
  }).withZone('example.com', [{
    expect: 'retained',
    data: { name: 'www', type: 'A', data: '1.1.1.1' },
  }, {
    expect: 'deletion',
    data: { name: 'www', type: 'TXT', data:
      '"heritage=external-dns,external-dns/owner=dnssynctest,external-dns/resource=e2e,record-type/A=managed,record-type/E2E=managed"' },
  }, {
    expect: 'creation',
    data: { name: 'www', type: 'TXT', data:
      '"heritage=external-dns,external-dns/owner=dnssynctest,external-dns/resource=e2e,record-type/A=managed"' },
  }]).go());

Deno.test("[E2E: Vultr & TXT] Update changed A record",
  async () => await mockedVultrTest({
    registry: {
      txt_prefix: 'registry.',
    },
    sourceRecords: [{
      annotations: {},
      resourceKey: 'e2e',
      dns: {
        fqdn: "www.example.com",
        type: "A",
        target: '2.2.2.2',
      },
    }],
  }).withZone('example.com', [{
    expect: 'deletion',
    data: { name: 'www', type: 'A', data: '1.1.1.1' },
  }, {
    expect: 'creation',
    data: { name: 'www', type: 'A', data: '2.2.2.2' },
  }, {
    expect: 'retained',
    data: { name: 'registry.www', type: 'TXT', data:
      '"heritage=external-dns,external-dns/owner=dnssynctest,external-dns/resource=e2e,record-type/A=managed"' },
  }]).go());

Deno.test("[E2E: Vultr & TXT] Remove abandoned A record",
  async () => await mockedVultrTest({
    sourceRecords: [],
  }).withZone('example.com', [{
    expect: 'deletion',
    data: { name: 'www', type: 'A', data: '1.1.1.1' },
  }, {
    expect: 'deletion',
    data: { name: 'www', type: 'TXT', data:
      '"heritage=external-dns,external-dns/owner=dnssynctest,external-dns/resource=e2e,record-type/A=managed"' },
  }]).go());

Deno.test("[E2E: Vultr & TXT] Add new A record",
  async () => await mockedVultrTest({
    sourceRecords: [{
      annotations: {e2e: 'test'},
      resourceKey: 'e2e',
      dns: {
        fqdn: "www.example.com",
        type: "A",
        target: '1.1.1.1',
      },
    }],
  }).withZone('example.com', [{
    expect: 'creation',
    data: { name: 'www', type: 'A', data: '1.1.1.1' },
  }, {
    expect: 'creation',
    data: { name: 'www', type: 'TXT', data:
      '"heritage=external-dns,external-dns/owner=dnssynctest,external-dns/resource=e2e,record-type/A=managed"' },
  }]).go());

Deno.test("[E2E: Vultr & TXT] Adopt record from other owner",
  async () => await mockedVultrTest({
    registry: {
      txt_prefix: 'registry.',
      auto_adopt_from_owner_ids: ['legacy'],
    },
    sourceRecords: [{
      annotations: {},
      resourceKey: 'e2e',
      dns: {
        fqdn: "www.example.com",
        type: "A",
        target: '2.2.2.2',
      },
    }],
  }).withZone('example.com', [{
    expect: 'deletion',
    data: { name: 'www', type: 'A', data: '1.1.1.1' },
  }, {
    expect: 'creation',
    data: { name: 'www', type: 'A', data: '2.2.2.2' },
  }, {
    expect: 'deletion',
    data: { name: 'registry.www', type: 'TXT', data:
      '"heritage=external-dns,external-dns/owner=legacy"' },
  }, {
    expect: 'creation',
    data: { name: 'registry.www', type: 'TXT', data:
      '"heritage=external-dns,external-dns/owner=dnssynctest,external-dns/resource=e2e,record-type/A=managed"' },
  }]).go());

Deno.test("[E2E: Vultr & TXT] Adopt without changes",
  async () => await mockedVultrTest({
    registry: {
      txt_prefix: 'registry.',
      auto_adopt_from_owner_ids: ['legacy'],
    },
    sourceRecords: [{
      annotations: {},
      resourceKey: 'e2e',
      dns: {
        fqdn: "www.example.com",
        type: "A",
        target: '1.1.1.1',
      },
    }],
  }).withZone('example.com', [{
    expect: 'retained',
    data: { name: 'www', type: 'A', data: '1.1.1.1' },
  }, {
    expect: 'deletion',
    data: { name: 'registry.www', type: 'TXT', data:
      '"heritage=external-dns,external-dns/owner=legacy"' },
  }, {
    expect: 'creation',
    data: { name: 'registry.www', type: 'TXT', data:
      '"heritage=external-dns,external-dns/owner=dnssynctest,external-dns/resource=e2e,record-type/A=managed"' },
  }]).go());

//////

function mockedVultrTest(opts: {
  registry?: Partial<TxtRegistryConfig>,
  provider?: Partial<VultrProviderConfig>,
  vultr?: VultrApiMock,
  // vultrRecords?: DnsRecordData[],
  sourceRecords: Array<SourceRecord>,
}) {

  const registry = new TxtRegistry({
    type: 'txt',
    txt_owner_id: 'dnssynctest',
    ...opts.registry,
  });
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
