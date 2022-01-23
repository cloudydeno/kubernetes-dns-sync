import { applyToProvider } from "../../integration-tests/apply.ts";
import { NoopRegistry } from "../../registries/noop.ts";

import { VultrApiMock } from "./mock.ts";
import { VultrProvider } from "./mod.ts";

Deno.test('vultr record replacement', async () => {

  const apiMock = new VultrApiMock();
  const provider = new VultrProvider({
    type: 'vultr',
    domain_filter: ['example.com'],
  }, apiMock);

  apiMock.addMockedDeadZone('another.com');
  apiMock.addMockedZone('example.com', [{
    expect: 'deletion',
    data: { name: 'www', type: 'A', data: '1.1.1.1' },
  }, {
    expect: 'creation',
    data: { name: 'www', type: 'A', data: '2.2.2.2' },
  }]);

  await applyToProvider(provider, new NoopRegistry({type: 'noop'}), [{
    annotations: {},
    resourceKey: 'test',
    dns: {
      fqdn: 'www.example.com',
      type: 'A',
      target: '2.2.2.2',
    },
  }]);

  apiMock.verifyCompletion();
});

Deno.test('vultr partial record update', async () => {

  const apiMock = new VultrApiMock();
  const provider = new VultrProvider({
    type: 'vultr',
    domain_filter: ['example.com'],
  }, apiMock);

  apiMock.addMockedDeadZone('another.com');
  apiMock.addMockedZone('example.com', [{
    expect: 'retained',
    data: { name: 'www', type: 'A', data: '1.1.1.1' },
  }, {
    expect: 'deletion',
    data: { name: 'www', type: 'A', data: '2.2.2.2' },
  }, {
    expect: 'creation',
    data: { name: 'www', type: 'A', data: '3.3.3.3' },
  }]);

  await applyToProvider(provider, new NoopRegistry({type: 'noop'}), [{
    annotations: {},
    resourceKey: 'test',
    dns: {
      fqdn: 'www.example.com',
      type: 'A',
      target: '1.1.1.1',
    },
  }, {
    annotations: {},
    resourceKey: 'test',
    dns: {
      fqdn: 'www.example.com',
      type: 'A',
      target: '3.3.3.3',
    },
  }]);

  apiMock.verifyCompletion();
});
