import { assertEquals } from "https://deno.land/std@0.115.0/testing/asserts.ts";
import { DnsProvider, DnsProviderContext, DnsRegistry, DnsRegistryContext, Endpoint } from "../common/contract.ts";

import { DnsRecord, DnsRecordData, DomainRecord } from "../providers/vultr/api.ts";
import { VultrProvider } from "../providers/vultr/mod.ts";
import { VultrApiMock } from "../providers/vultr/mock.ts";
import { TxtRegistry } from "../registries/txt.ts";
import { Planner } from "./planner.ts";

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
      '"heritage=external-dns,external-dns/owner=dnssynctest,record-type/A=managed"' },
  }]);

  const provider = new VultrProvider({
    type: 'vultr',
  }, apiMock);

  await performMain(provider, registry, [{
    DNSName: "www.example.com",
    RecordType: "A",
    Targets: ["1.1.1.1"],
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
      '"heritage=external-dns,external-dns/owner=dnssynctest,record-type/A=managed"' },
  }]);

  const provider = new VultrProvider({
    type: 'vultr',
  }, apiMock);

  await performMain(provider, registry, [{
    DNSName: "www.example.com",
    RecordType: "A",
    Targets: ["2.2.2.2"],
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
      '"heritage=external-dns,external-dns/owner=dnssynctest,record-type/A=managed"' },
  }]);

  const provider = new VultrProvider({
    type: 'vultr',
  }, apiMock);

  await performMain(provider, registry, []);

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
      '"heritage=external-dns,external-dns/owner=dnssynctest,record-type/A=managed,e2e=test"' },
  }]);

  const provider = new VultrProvider({
    type: 'vultr',
  }, apiMock);

  await performMain(provider, registry, [{
    DNSName: "www.example.com",
    RecordType: "A",
    Targets: ["1.1.1.1"],
    Labels: {e2e: 'test'},
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
      '"heritage=external-dns,external-dns/owner=dnssynctest,record-type/A=managed"' },
  }]);

  const provider = new VultrProvider({
    type: 'vultr',
  }, apiMock);

  await performMain(provider, registry, [{
    DNSName: "www.example.com",
    RecordType: "A",
    Targets: ["2.2.2.2"],
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
    expect: 'retained',
    data: { name: 'registry.www', type: 'TXT', data:
      '"heritage=external-dns,external-dns/owner=legacy"' },
  // }, { // TODO: update registry records even when main records are unchanged
  //   expect: 'creation',
  //   data: { name: 'registry.www', type: 'TXT', data:
  //     '"heritage=external-dns,external-dns/owner=dnssynctest,record-type/A=managed"' },
  }]);

  const provider = new VultrProvider({
    type: 'vultr',
  }, apiMock);

  await performMain(provider, registry, [{
    DNSName: "www.example.com",
    RecordType: "A",
    Targets: ["1.1.1.1"],
  }]);

  apiMock.verifyCompletion();
});

/**
 * This is a mirror of mod.ts/output.ts except without any logging/prompting.
 * Also, DnsSource isn't used because it doesn't really interact with planning.
 */
async function performMain<
  Tprovider extends DnsProviderContext,
  Tregistry extends DnsRegistryContext,
>(
  provider: DnsProvider<Tprovider>,
  registry: DnsRegistry<Tregistry>,
  sourceRecords: Array<Endpoint>,
) {
  // Create contexts
  const providerCtx = await provider.NewContext();
  const registryCtx = registry.NewContext(providerCtx.Zones);
  // Load existing records
  const rawExisting = await providerCtx.Records();
  const existingRecords = await registryCtx.RecognizeLabels(rawExisting);
  // Plan changes using source records
  const planner = new Planner(providerCtx.Zones);
  const changes = planner.PlanChanges(sourceRecords, existingRecords);
  // Push desired changes back to the provider
  const rawChanges = await registryCtx.CommitLabels(changes);
  if (rawChanges.length > 0) {
    // It's ok to always call this, but the real program only calls when needed
    await providerCtx.ApplyChanges(rawChanges);
  }
  return rawChanges;
}
