import { assertEquals, assertThrows } from "https://deno.land/std@0.115.0/testing/asserts.ts";

import { Planner } from "./planner.ts";

Deno.test("first-time plan (happy path)", () => {
  const planner = new Planner([{
    DNSName: "example.com",
    ZoneID: "ex",
  }]);

  const changes = planner.PlanChanges([{
    DNSName: "app.example.com",
    RecordType: "A",
    Targets: ["1.1.1.1"],
  }], []);

  assertEquals(changes.Create.length, 1);
  assertEquals(changes.Update.length, 0);
  assertEquals(changes.Delete.length, 0);

  const [creation] = changes.Create;
  assertEquals(creation.DNSName, "app.example.com");
  assertEquals(creation.RecordType, "A");
  assertEquals(creation.Targets, ["1.1.1.1"]);
});

Deno.test("first-time plan (unknown domain)", () => {
  const planner = new Planner([{
    DNSName: "example.com",
    ZoneID: "ex",
  }]);

  const changes = planner.PlanChanges([{
    DNSName: "app.another.com",
    RecordType: "A",
    Targets: ["1.1.1.1"],
  }], []);

  assertEquals(changes.Create.length, 0);
  assertEquals(changes.Update.length, 0);
  assertEquals(changes.Delete.length, 0);
});

Deno.test("no-change plan", () => {
  const planner = new Planner([{
    DNSName: "example.com",
    ZoneID: "ex",
  }]);

  const changes = planner.PlanChanges([{
    DNSName: "app.example.com",
    RecordType: "A",
    Targets: ["1.1.1.1"],
  }], [{
    DNSName: "app.example.com",
    RecordType: "A",
    Targets: ["1.1.1.1"],
    Labels: {'is-ours': 'yes'},
  }]);

  assertEquals(changes.Create.length, 0);
  assertEquals(changes.Update.length, 0);
  assertEquals(changes.Delete.length, 0);
});

Deno.test("plan with record updates", () => {
  const planner = new Planner([{
    DNSName: "example.com",
    ZoneID: "ex",
  }]);

  const changes = planner.PlanChanges([{
    DNSName: "app.example.com",
    RecordType: "A",
    Targets: ["2.2.2.2", "3.3.3.3"],
  }], [{
    DNSName: "app.example.com",
    RecordType: "A",
    Targets: ["1.1.1.1"],
    Labels: {'is-ours': 'yes'},
  }]);

  assertEquals(changes.Create.length, 0);
  assertEquals(changes.Update.length, 1);
  assertEquals(changes.Delete.length, 0);

  const [update] = changes.Update;
  assertEquals(update[0].DNSName, "app.example.com");
  assertEquals(update[1].DNSName, "app.example.com");
  assertEquals(update[0].RecordType, "A");
  assertEquals(update[1].RecordType, "A");
  assertEquals(update[0].Targets, ["1.1.1.1"]);
  assertEquals(update[1].Targets, ["2.2.2.2", "3.3.3.3"]);
});

Deno.test("conflicting records", () => {
  const planner = new Planner([{
    DNSName: "example.com",
    ZoneID: "ex",
  }]);

  assertThrows(() => {
    const changes = planner.PlanChanges([{
      DNSName: "app.example.com",
      RecordType: "A",
      Targets: ["1.1.1.1"],
    }], [{
      DNSName: "app.example.com",
      RecordType: "A",
      Targets: ["1.1.1.1"],
      Labels: {'is-ours': ''},
    }]);
  }, Error, 'clash with unmanaged records');
});
