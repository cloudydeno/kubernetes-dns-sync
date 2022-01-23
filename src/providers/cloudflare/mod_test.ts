import { applyToProvider } from "../../integration-tests/apply.ts";
import { NoopRegistry } from "../../registries/noop.ts";

import { CloudflareApiMock } from "./mock.ts";
import { CloudflareProvider } from "./mod.ts";

Deno.test('cloudflare record update', async () => {

  const apiMock = new CloudflareApiMock();
  const provider = new CloudflareProvider({
    type: 'cloudflare',
    domain_filter: ['example.com'],
  }, apiMock);

  apiMock.addMockedDeadZone('11', 'another.com');
  apiMock.addMockedZone('22', 'example.com', [{
    expect: 'deletion',
    data: { name: 'www.example.com', type: 'A', content: '1.1.1.1', ttl: 1 },
  }, {
    expect: 'creation',
    data: { name: 'www.example.com', type: 'A', content: '2.2.2.2', ttl: 1 },
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

Deno.test('cloudflare partial record update', async () => {

  const apiMock = new CloudflareApiMock();
  const provider = new CloudflareProvider({
    type: 'cloudflare',
    domain_filter: ['example.com'],
    proxied_by_default: true,
  }, apiMock);

  apiMock.addMockedDeadZone('11', 'another.com');
  apiMock.addMockedZone('22', 'example.com', [{
    expect: 'retained',
    data: { name: 'www.example.com', type: 'A', content: '1.1.1.1', ttl: 1 },
  }, {
    expect: 'deletion',
    data: { name: 'www.example.com', type: 'A', content: '2.2.2.2', ttl: 1 },
  }, {
    expect: 'creation',
    data: { name: 'www.example.com', type: 'A', content: '3.3.3.3', ttl: 1 },
  }]);

  await applyToProvider(provider, new NoopRegistry({type: 'noop'}), [{
    annotations: {
      // 'external-dns.alpha.kubernetes.io/cloudflare-proxied': 'true',
    },
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
