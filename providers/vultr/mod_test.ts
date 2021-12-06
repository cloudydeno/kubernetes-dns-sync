import { assertEquals } from "https://deno.land/std@0.105.0/testing/asserts.ts";
import { Changes, Endpoint } from "../../common/contract.ts";
import { DnsRecord, DnsRecordData, DomainRecord } from "./api.ts";
import { VultrProvider } from "./mod.ts";

Deno.test('vultr record update', async () => {

  const provider = new VultrProvider({
    type: 'vultr',
    domain_filter: ['example.com'],
  }, {
    async *listAllZones(): AsyncGenerator<DomainRecord> {
      yield {
        domain: 'example.com',
        date_created: 'mock',
      };
      yield {
        domain: 'another.com',
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

  const ctx = await provider.NewContext();

  const foundEndpoints = await ctx.Records();
  assertEquals(foundEndpoints.length, 1);

  const newEndpoints: Array<Endpoint> = [{
    DNSName: 'www.example.com',
    RecordType: 'A',
    Targets: ['2.2.2.2'],
  }];

  const changes = new Changes(newEndpoints, foundEndpoints);
  changes.Update.push([foundEndpoints[0], newEndpoints[0]]);

  await ctx.ApplyChanges(changes);
});
