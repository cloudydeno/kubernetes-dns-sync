import { assertEquals } from "@std/assert/equals";

import { splitIntoV4andV6 } from "./dns-endpoints.ts";

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
  const splitEndpoints = splitIntoV4andV6(opts.inputTargets);

  // Check number of resulting endpoints
  assertEquals(splitEndpoints.length, opts.inputTargets.length, 'Wrong number of endpoints emitted');

  const v4Targets = splitEndpoints.filter(x => x.type === 'A').map(x => x.target);
  assertEquals(v4Targets, opts.expectedIPv4Targets);

  const v6Targets = splitEndpoints.filter(x => x.type === 'AAAA').map(x => x.target);;
  assertEquals(v6Targets, opts.expectedIPv6Targets);
}
