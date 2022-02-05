import { assertEquals, assertObjectMatch } from "https://deno.land/std@0.115.0/testing/asserts.ts";

import type { Zone, BaseRecord } from "../defs/types.ts";
import { buildDiff } from "./zone-diff.ts";
import { getPlainRecordKey } from "./dns-endpoints.ts";

const exampleZone: Zone = {
  fqdn: "example.com",
  zoneId: "ex",
};
const aRecord = (target: string): BaseRecord => ({ dns: {
  fqdn: 'app.example.com',
  type: 'A',
  target,
} });

const keyMakers = {
  ComparisionKey: (x: BaseRecord) => JSON.stringify(getPlainRecordKey(x.dns)),
  GroupingKey: (x: BaseRecord) => JSON.stringify([x.dns.fqdn, x.dns.type]),
};

Deno.test("first-time diff (happy path)", () => {
  const diff = buildDiff({
    Zone: exampleZone,
    Existing: [],
    Desired: [aRecord("1.1.1.1")],
  }, keyMakers);

  assertEquals(diff.length, 1);
  assertObjectMatch(diff[0], {
    type: 'creation',
    toCreate: [aRecord("1.1.1.1")],
  });
});

Deno.test("no-change diff", () => {
  const diff = buildDiff({
    Zone: exampleZone,
    Existing: [aRecord("1.1.1.1")],
    Desired: [aRecord("1.1.1.1")],
  }, keyMakers);

  assertEquals(diff.length, 0);
});

Deno.test("diff with record updates", () => {
  const diff = buildDiff({
    Zone: exampleZone,
    Existing: [aRecord("1.1.1.1")],
    Desired: [aRecord("2.2.2.2"), aRecord("3.3.3.3")],
  }, keyMakers);

  assertEquals(diff.length, 1);
  assertObjectMatch(diff[0], {
    type: 'update',
    toDelete: [aRecord('1.1.1.1')],
    toCreate: [aRecord("2.2.2.2"), aRecord("3.3.3.3")],
  });
});
