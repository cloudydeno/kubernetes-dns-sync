import { assertEquals } from "https://deno.land/std@0.115.0/testing/asserts.ts";
import { buildDiff } from "../../dns-logic/diff.ts";
import { SourceRecord, ZoneState } from "../../types.ts";

import { CloudflareApiMock } from "./mock.ts";
import { CloudflareProvider, CloudflareRecord } from "./mod.ts";

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

  const newEndpoints = new Array<SourceRecord>({
    annotations: {},
    resourceKey: 'test',
    dns: {
      fqdn: 'www.example.com',
      type: 'A',
      target: '2.2.2.2',
    },
  }).map(x => provider.EnrichSourceRecord(x))
    .flatMap(x => x ? [x] : []);

  const zones = await provider.ListZones();
  assertEquals(zones.length, 1);

  const foundEndpoints = await provider.ListRecords(zones[0]);
  assertEquals(foundEndpoints.length, 1);

  const state: ZoneState<CloudflareRecord> = {
    Zone: zones[0],
    Existing: foundEndpoints,
    Desired: newEndpoints,
  };
  state.Diff = buildDiff(state, provider);

  await provider.ApplyChanges(state);

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

  const newEndpoints = new Array<SourceRecord>({
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
  }).map(x => provider.EnrichSourceRecord(x))
    .flatMap(x => x ? [x] : []);

  const zones = await provider.ListZones();
  assertEquals(zones.length, 1);

  const foundEndpoints = await provider.ListRecords(zones[0]);
  assertEquals(foundEndpoints.length, 2);

  const state: ZoneState<CloudflareRecord> = {
    Zone: zones[0],
    Existing: foundEndpoints,
    Desired: newEndpoints,
  };
  state.Diff = buildDiff(state, provider);

  // for (const change of state.Diff) {
  //   console.log(change);
  // }

  await provider.ApplyChanges(state);

  apiMock.verifyCompletion();
});
