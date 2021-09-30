import { assertEquals } from "https://deno.land/std@0.105.0/testing/asserts.ts";
import { SplitByIPVersion, SplitOutTarget } from "./endpoints.ts";

Deno.test('Dualstack targets', () => {
  const splitEndpoints = SplitByIPVersion({
    DNSName: 'example.com',
    RecordType: 'A',
    Targets: ['127.0.0.1', '::1'],
    RecordTTL: 60,
    Labels: {
      'external-dns/resource': `test-suite`,
    },
    SplitOutTarget,
  });

  assertEquals(splitEndpoints.length, 2);

  const v4Endpoints = splitEndpoints.filter(x => x.RecordType === 'A');
  assertEquals(v4Endpoints.length, 1);

  const v6Endpoints = splitEndpoints.filter(x => x.RecordType === 'AAAA');
  assertEquals(v6Endpoints.length, 1);

});
