import { VultrProvider } from "../providers/vultr/mod.ts";
import { VultrApiMock } from "../providers/vultr/mock.ts";
import { TxtRegistry } from "../registries/txt.ts";
import { applyToProvider } from "../common/test-utils.ts";
import { NoopRegistry } from "../registries/noop.ts";

Deno.test("[E2E: Vultr & TXT] Keep unchanged A record", async () => {

  const registry = new TxtRegistry({
    type: 'txt',
    txt_owner_id: 'dnssynctest',
  });

  const apiMock = new VultrApiMock();
  apiMock.addMockedZone('example.com', [{
    expect: 'retained',
    data: { name: 'www', type: 'A', data: '1.1.1.1' },
  }, {
    expect: 'retained',
    data: { name: 'www', type: 'TXT', data:
      '"heritage=external-dns,external-dns/owner=dnssynctest,external-dns/resource=e2e,record-type/A=managed"' },
  }]);

  const provider = new VultrProvider({
    type: 'vultr',
  }, apiMock);

  await applyToProvider(provider, registry, [{
    annotations: {},
    resourceKey: 'e2e',
    dns: {
      fqdn: "www.example.com",
      type: "A",
      target: '1.1.1.1',
    },
  }]);

  apiMock.verifyCompletion();
});

Deno.test("[E2E: Vultr & TXT] Update unscoped registry record", async () => {

  const registry = new TxtRegistry({
    type: 'txt',
    txt_owner_id: 'dnssynctest',
  });

  const apiMock = new VultrApiMock();
  apiMock.addMockedZone('example.com', [{
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
  }]);

  const provider = new VultrProvider({
    type: 'vultr',
  }, apiMock);

  await applyToProvider(provider, registry, [{
    annotations: {},
    resourceKey: 'e2e',
    dns: {
      fqdn: "www.example.com",
      type: "A",
      target: '1.1.1.1',
    },
  }]);

  apiMock.verifyCompletion();
});

Deno.test("[E2E: Vultr & TXT] Update outdated registry record", async () => {

  const registry = new TxtRegistry({
    type: 'txt',
    txt_owner_id: 'dnssynctest',
  });

  const apiMock = new VultrApiMock();
  apiMock.addMockedZone('example.com', [{
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
  }]);

  const provider = new VultrProvider({
    type: 'vultr',
  }, apiMock);

  await applyToProvider(provider, registry, [{
    annotations: {},
    resourceKey: 'e2e',
    dns: {
      fqdn: "www.example.com",
      type: "A",
      target: '1.1.1.1',
    },
  }]);

  apiMock.verifyCompletion();
});

Deno.test("[E2E: Vultr & TXT] Update changed A record", async () => {

  const registry = new TxtRegistry({
    type: 'txt',
    txt_owner_id: 'dnssynctest',
    txt_prefix: 'registry.',
  });

  const apiMock = new VultrApiMock();
  apiMock.addMockedZone('example.com', [{
    expect: 'deletion',
    data: { name: 'www', type: 'A', data: '1.1.1.1' },
  }, {
    expect: 'creation',
    data: { name: 'www', type: 'A', data: '2.2.2.2' },
  }, {
    expect: 'retained',
    data: { name: 'registry.www', type: 'TXT', data:
      '"heritage=external-dns,external-dns/owner=dnssynctest,external-dns/resource=e2e,record-type/A=managed"' },
  }]);

  const provider = new VultrProvider({
    type: 'vultr',
  }, apiMock);

  await applyToProvider(provider, registry, [{
    annotations: {},
    resourceKey: 'e2e',
    dns: {
      fqdn: "www.example.com",
      type: "A",
      target: '2.2.2.2',
    },
  }]);

  apiMock.verifyCompletion();
});

Deno.test("[E2E: Vultr & TXT] Remove abandoned A record", async () => {

  const registry = new TxtRegistry({
    type: 'txt',
    txt_owner_id: 'dnssynctest',
  });

  const apiMock = new VultrApiMock();
  apiMock.addMockedZone('example.com', [{
    expect: 'deletion',
    data: { name: 'www', type: 'A', data: '1.1.1.1' },
  }, {
    expect: 'deletion',
    data: { name: 'www', type: 'TXT', data:
      '"heritage=external-dns,external-dns/owner=dnssynctest,external-dns/resource=e2e,record-type/A=managed"' },
  }]);

  const provider = new VultrProvider({
    type: 'vultr',
  }, apiMock);

  await applyToProvider(provider, registry, []);

  apiMock.verifyCompletion();
});

Deno.test("[E2E: Vultr & TXT] Add new A record", async () => {

  const registry = new TxtRegistry({
    type: 'txt',
    txt_owner_id: 'dnssynctest',
  });

  const apiMock = new VultrApiMock();
  apiMock.addMockedZone('example.com', [{
    expect: 'creation',
    data: { name: 'www', type: 'A', data: '1.1.1.1' },
  }, {
    expect: 'creation',
    data: { name: 'www', type: 'TXT', data:
      '"heritage=external-dns,external-dns/owner=dnssynctest,external-dns/resource=e2e,record-type/A=managed"' },
  }]);

  const provider = new VultrProvider({
    type: 'vultr',
  }, apiMock);

  await applyToProvider(provider, registry, [{
    annotations: {e2e: 'test'},
    resourceKey: 'e2e',
    dns: {
      fqdn: "www.example.com",
      type: "A",
      target: '1.1.1.1',
    },
  }]);

  apiMock.verifyCompletion();
});

Deno.test("[E2E: Vultr & TXT] Adopt record from other owner", async () => {

  const registry = new TxtRegistry({
    type: 'txt',
    txt_owner_id: 'dnssynctest',
    txt_prefix: 'registry.',
    auto_adopt_from_owner_ids: ['legacy'],
  });

  const apiMock = new VultrApiMock();
  apiMock.addMockedZone('example.com', [{
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
  }]);

  const provider = new VultrProvider({
    type: 'vultr',
  }, apiMock);

  await applyToProvider(provider, registry, [{
    annotations: {},
    resourceKey: 'e2e',
    dns: {
      fqdn: "www.example.com",
      type: "A",
      target: '2.2.2.2',
    },
  }]);

  apiMock.verifyCompletion();
});

Deno.test("[E2E: Vultr & TXT] Adopt without changes", async () => {

  const registry = new TxtRegistry({
    type: 'txt',
    txt_owner_id: 'dnssynctest',
    txt_prefix: 'registry.',
    auto_adopt_from_owner_ids: ['legacy'],
  });

  const apiMock = new VultrApiMock();
  apiMock.addMockedZone('example.com', [{
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
  }]);

  const provider = new VultrProvider({
    type: 'vultr',
  }, apiMock);

  await applyToProvider(provider, registry, [{
    annotations: {},
    resourceKey: 'e2e',
    dns: {
      fqdn: "www.example.com",
      type: "A",
      target: '1.1.1.1',
    },
  }]);

  apiMock.verifyCompletion();
});
