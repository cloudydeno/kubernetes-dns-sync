import { assertEquals } from "https://deno.land/std@0.105.0/testing/asserts.ts";
import { DnsProvider, DnsProviderContext, DnsRegistry, DnsRegistryContext, Endpoint } from "../common/contract.ts";

import { DnsRecord, DnsRecordData, DomainRecord } from "../providers/vultr/api.ts";
import { VultrProvider } from "../providers/vultr/mod.ts";
import { TxtRegistry } from "../registries/txt.ts";
import { Planner } from "./planner.ts";

Deno.test("[E2E] Update A record: TXT registry, Vultr provider", async () => {

  const registry = new TxtRegistry({
    txt_owner_id: 'dnssynctest',
    type: 'txt',
  });

  const provider = new VultrProvider({
    type: 'vultr',
    domain_filter: ['example.com'],
  }, {
    async *listAllZones(): AsyncGenerator<DomainRecord> {
      yield {
        domain: 'example.com',
        date_created: 'mock',
      };
    },
    async *listAllRecords(): AsyncGenerator<DnsRecord> {
      yield {
        id: 'www-A',
        name: 'www',
        type: 'A',
        data: '1.1.1.1',
        priority: 0,
        ttl: 60,
      };
      yield {
        id: 'www-registry',
        name: 'www',
        type: 'TXT',
        data: '"heritage=external-dns,external-dns/owner=dnssynctest,record-type/A=managed"',
        priority: 0,
        ttl: 60,
      };
    },
    createRecord(zone: string,
      record: DnsRecordData,
    ): Promise<DnsRecord> {
      assertEquals(zone, 'example.com');
      assertEquals(record.name, 'www');
      assertEquals(record.data, '2.2.2.2');
      return Promise.resolve({
        priority: 0,
        ttl: 60,
        ...record,
        id: 'new-www-A',
      })
    },
    updateRecord(zone: string,
      recordId: string,
      changes: Partial<Omit<DnsRecordData, "type">>,
    ): Promise<void> {
      return Promise.reject(new Error('TODO'));
    },
    deleteRecord(zone: string,
      recordId: string,
    ): Promise<void> {
      assertEquals(zone, 'example.com');
      assertEquals(recordId, 'www-A');
      return Promise.resolve();
    },
  });

  const sourceRecords: Array<Endpoint> = [{
    DNSName: "www.example.com",
    RecordType: "A",
    Targets: ["2.2.2.2"],
  }];

  const rawChanges = await performMain(provider, registry, sourceRecords);

  assertEquals(rawChanges.Create.length, 0);
  assertEquals(rawChanges.Update.length, 1);
  assertEquals(rawChanges.Delete.length, 0);
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
