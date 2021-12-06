import { assertEquals } from "https://deno.land/std@0.105.0/testing/asserts.ts";

import { SplitByIPVersion } from "./endpoints.ts";

Deno.test('Endpoint SplitByIPVersion: Dualstack targets', () => {
  verifySplitByIPVersion({
    inputTargets: ['127.0.0.1', '::1', '::2'],
    expectedIPv4Targets: ['127.0.0.1'],
    expectedIPv6Targets: ['::1', '::2'],
  });

  verifySplitByIPVersion({
    inputTargets: ['::1', '127.0.0.1'],
    expectedIPv4Targets: ['127.0.0.1'],
    expectedIPv6Targets: ['::1'],
  });
});

Deno.test('Endpoint SplitByIPVersion: IPv4-only targets', () => {
  verifySplitByIPVersion({
    inputTargets: ['1.1.1.1', '2.2.2.2'],
    expectedIPv4Targets: ['1.1.1.1', '2.2.2.2'],
    expectedIPv6Targets: [],
  });
});

Deno.test('Endpoint SplitByIPVersion: IPv6-only targets', () => {
  verifySplitByIPVersion({
    inputTargets: ['::1', '::2'],
    expectedIPv4Targets: [],
    expectedIPv6Targets: ['::1', '::2'],
  });
});

Deno.test('Endpoint SplitByIPVersion: Zero targets', () => {
  verifySplitByIPVersion({
    inputTargets: [],
    expectedIPv4Targets: [],
    expectedIPv6Targets: [],
  });
});


/**
 * Helper to assert SplitByIPVersion's splitting behavior
 */
function verifySplitByIPVersion(opts: {
  inputTargets: string[],
  expectedIPv4Targets: string[],
  expectedIPv6Targets: string[],
}) {
  const splitEndpoints = SplitByIPVersion({
    DNSName: 'example.com',
    RecordType: 'A',
    Targets: opts.inputTargets,
  });

  // Check number of resulting endpoints
  const expectedCount = [opts.expectedIPv4Targets, opts.expectedIPv6Targets]
    .map<number>(x => x.length > 0 ? 1 : 0)
    .reduce((a,b) => a+b, 0);
  assertEquals(splitEndpoints.length, expectedCount, 'Wrong number of endpoints emitted');

  if (opts.expectedIPv4Targets.length > 0) {
    const v4Endpoints = splitEndpoints.filter(x => x.RecordType === 'A');
    assertEquals(v4Endpoints.length, 1);
    assertEquals(v4Endpoints[0].Targets, opts.expectedIPv4Targets);
  }

  if (opts.expectedIPv6Targets.length > 0) {
    const v6Endpoints = splitEndpoints.filter(x => x.RecordType === 'AAAA');
    assertEquals(v6Endpoints.length, 1);
    assertEquals(v6Endpoints[0].Targets, opts.expectedIPv6Targets);
  }
}
