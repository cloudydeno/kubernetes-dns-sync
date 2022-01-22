import { VultrProvider } from "../providers/vultr/mod.ts";
import { VultrApiMock } from "../providers/vultr/mock.ts";
import { applyToProvider } from "../common/test-utils.ts";
import { NoopRegistry } from "../registries/noop.ts";

Deno.test("[E2E: Vultr & noop] Update changed A record", async () => {

  const registry = new NoopRegistry({
    type: 'noop',
  });

  const apiMock = new VultrApiMock();
  apiMock.addMockedZone('example.com', [{
    expect: 'deletion',
    data: { name: 'www', type: 'A', data: '1.1.1.1' },
  }, {
    expect: 'creation',
    data: { name: 'www', type: 'A', data: '2.2.2.2' },
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

Deno.test("[E2E: Vultr & noop] Clean up unrelated records", async () => {

  const registry = new NoopRegistry({
    type: 'noop',
  });

  const apiMock = new VultrApiMock();
  apiMock.addMockedZone('example.com', [{
    // noop registry shouldn't try removing the zone's identity records
    expect: 'retained',
    data: { name: '', type: 'NS', data: 'ns1.website' },
  }, {
    expect: 'retained',
    data: { name: 'www', type: 'A', data: '1.1.1.1' },
  }, {
    expect: 'deletion',
    data: { name: 'www', type: 'A', data: '2.2.2.2' },
  }, {
    expect: 'deletion',
    data: { name: 'asdf', type: 'A', data: '3.3.3.3' },
  }, {
    expect: 'deletion',
    data: { name: '', type: 'MX', data: '5 mx.website' },
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
