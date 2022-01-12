import { assertEquals } from "https://deno.land/std@0.115.0/testing/asserts.ts";

import { SourceRecord } from "../../common/contract.ts";
import { buildDiff } from "../../common/diff.ts";
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

  const diff = buildDiff({
    Zone: zones[0],
    Existing: foundEndpoints,
    Desired: newEndpoints,
  }, provider.ComparisionKey.bind(this));

  await provider.ApplyChanges(diff);

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

  const newEndpoints = new Array<SourceRecord>({
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
  }).map(x => provider.EnrichSourceRecord(x))
    .flatMap(x => x ? [x] : []);

  const zones = await provider.ListZones();
  assertEquals(zones.length, 1);

  const foundEndpoints = await provider.ListRecords(zones[0]);
  assertEquals(foundEndpoints.length, 2);

  const diff = buildDiff({
    Zone: zones[0],
    Existing: foundEndpoints,
    Desired: newEndpoints,
  }, provider.ComparisionKey.bind(this));

  await provider.ApplyChanges(diff);

  apiMock.verifyCompletion();
});
