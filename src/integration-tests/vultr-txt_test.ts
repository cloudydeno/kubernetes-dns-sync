import type { RegistryConfig } from "../common/config.ts";
import { mockedVultrTest } from "./vultr-mock.ts";

const defaultRegistry: RegistryConfig = {
  type: 'txt',
  txt_owner_id: 'dnssynctest',
};

Deno.test("[E2E: Vultr & TXT] Keep unchanged A record",
  async () => await mockedVultrTest({
    registry: defaultRegistry,
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
    registry: defaultRegistry,
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
    registry: defaultRegistry,
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
    registry: { ...defaultRegistry,
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

Deno.test("[E2E: Vultr & TXT] Remove our abandoned A record",
  async () => await mockedVultrTest({
    registry: defaultRegistry,
    sourceRecords: [],
  }).withZone('example.com', [{
    expect: 'deletion',
    data: { name: 'www', type: 'A', data: '1.1.1.1' },
  }, {
    expect: 'deletion',
    data: { name: 'www', type: 'TXT', data:
      '"heritage=external-dns,external-dns/owner=dnssynctest,external-dns/resource=e2e,record-type/A=managed"' },
  }]).go());

Deno.test("[E2E: Vultr & TXT] Leave unmanaged records alone",
  async () => await mockedVultrTest({
    registry: defaultRegistry,
    sourceRecords: [],
  }).withZone('example.com', [{
    expect: 'retained',
    data: { name: 'www', type: 'A', data: '1.1.1.1' },
  }, {
    expect: 'retained',
    data: { name: '', type: 'NS', data: 'ns.example' },
  }, {
    expect: 'retained',
    data: { name: 'www', type: 'TXT', data:
      '"heritage=external-dns,external-dns/owner=otherapp,external-dns/resource=e2e,record-type/A=managed"' },
  }]).go());

Deno.test("[E2E: Vultr & TXT] Be v careful around registry records",
  async () => await mockedVultrTest({
    registry: defaultRegistry,
    sourceRecords: [],
  }).withZone('example.com', [{
    expect: 'retained',
    data: { name: 'other', type: 'AAAA', data: '::1' },
  }, {
    expect: 'deletion',
    data: { name: 'self', type: 'TXT', data:
      '"heritage=external-dns,external-dns/owner=dnssynctest,external-dns/resource=e2e,record-type/A=managed"' },
  }, {
    expect: 'retained',
    data: { name: 'other', type: 'TXT', data:
      '"heritage=external-dns,external-dns/owner=otherapp,external-dns/resource=e2e,record-type/AAAA=managed"' },
  }]).go());

Deno.test("[E2E: Vultr & TXT] Add new A record",
  async () => await mockedVultrTest({
    registry: defaultRegistry,
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
    registry: { ...defaultRegistry,
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
    registry: { ...defaultRegistry,
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
