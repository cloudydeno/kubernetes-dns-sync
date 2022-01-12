import { assertEquals, assertObjectMatch } from "https://deno.land/std@0.115.0/testing/asserts.ts";
import { Zone, BaseRecord } from "./contract.ts";
import { buildDiff } from "./diff.ts";
import { getPlainRecordKey } from "./endpoints.ts";


const exampleZone: Zone = {
  DNSName: "example.com",
  ZoneID: "ex",
};
const aRecord = (target: string): BaseRecord => ({ dns: {
  fqdn: 'app.example.com',
  type: 'A',
  target,
} });

Deno.test("first-time diff (happy path)", () => {
  const diff = buildDiff({
    Zone: exampleZone,
    Existing: [],
    Desired: [aRecord("1.1.1.1")],
  }, x => JSON.stringify(getPlainRecordKey(x.dns)));

  assertEquals(diff.toCreate.length, 1);
  // assertEquals(changes.Update.length, 0);
  assertEquals(diff.toDelete.length, 0);

  assertObjectMatch(diff.toCreate[0], { ...aRecord('1.1.1.1') });
});

Deno.test("no-change diff", () => {
  const diff = buildDiff({
    Zone: exampleZone,
    Existing: [aRecord("1.1.1.1")],
    Desired: [aRecord("1.1.1.1")],
  }, x => JSON.stringify(getPlainRecordKey(x.dns)));

  assertEquals(diff.toCreate.length, 0);
  // assertEquals(diff.toUpdate.length, 0);
  assertEquals(diff.toDelete.length, 0);
});

Deno.test("diff with record updates", () => {
  const diff = buildDiff({
    Zone: exampleZone,
    Existing: [aRecord("1.1.1.1")],
    Desired: [aRecord("2.2.2.2"), aRecord("3.3.3.3")],
  }, x => JSON.stringify(getPlainRecordKey(x.dns)));

  assertEquals(diff.toCreate.length, 2);
  // assertEquals(diff.Update.length, 1);
  assertEquals(diff.toDelete.length, 1);

  assertObjectMatch(diff.toDelete[0], { ...aRecord('1.1.1.1') });
  assertObjectMatch(diff.toCreate[0], { ...aRecord('2.2.2.2') });
  assertObjectMatch(diff.toCreate[1], { ...aRecord('3.3.3.3') });
});
