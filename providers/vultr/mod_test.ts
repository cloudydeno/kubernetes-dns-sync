import { assertEquals } from "https://deno.land/std@0.105.0/testing/asserts.ts";

import { Changes, Endpoint } from "../../common/contract.ts";
import { VultrApiMock } from "./mock.ts";
import { VultrProvider } from "./mod.ts";

Deno.test('vultr record update', async () => {

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

  const newEndpoints: Array<Endpoint> = [{
    DNSName: 'www.example.com',
    RecordType: 'A',
    Targets: ['2.2.2.2'],
  }];

  const ctx = await provider.NewContext();
  const foundEndpoints = await ctx.Records();
  assertEquals(foundEndpoints.length, 1);

  const changes = new Changes(newEndpoints, foundEndpoints);
  changes.Update.push([foundEndpoints[0], newEndpoints[0]]);

  await ctx.ApplyChanges(changes);

  apiMock.verifyCompletion();
});
