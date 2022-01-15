import { assertEquals, assertObjectMatch } from "https://deno.land/std@0.105.0/testing/asserts.ts";
import { BaseRecord, DnsProvider, DnsRegistry, SourceRecord, ZoneState } from "../../common/contract.ts";
import { buildDiff } from "../../common/diff.ts";
import { NoopRegistry } from "../../registries/noop.ts";
import { PowerDnsProvider } from "./mod.ts";

Deno.test('PowerDNS integration test', async () => {

  const provider = new PowerDnsProvider({
    type: 'powerdns',
    api_endpoint: 'http://localhost:7070/api/',
    domain_filter: ['test-world.com'],
  });
  await resetZone(provider, 'test-world.com');

  const registry = new NoopRegistry({type: 'noop'});

  {
    await applyToProvider(provider, registry, [{
      annotations: {},
      resourceKey: 'test',
      dns: {
        fqdn: 'www.test-world.com',
        type: 'A',
        target: '2.2.2.2',
      },
    }]);

    const result = await provider.api.getZone('test-world.com');
    assertEquals(result.rrsets.length, 2);
    assertObjectMatch(result.rrsets[0], {
      "name": "www.test-world.com.",
      "records": [
        {"content": "2.2.2.2", "disabled": false}
      ],
      "ttl": 300,
      "type": "A",
    });
    assertEquals(result.rrsets[1].type, 'SOA');
  }

  {
    await applyToProvider(provider, registry, [{
      annotations: {},
      resourceKey: 'test',
      dns: {
        fqdn: 'www.test-world.com',
        type: 'A',
        target: '3.3.3.3',
      },
    }]);

    const result = await provider.api.getZone('test-world.com');
    assertEquals(result.rrsets.length, 2);
    assertObjectMatch(result.rrsets[0], {
      "name": "www.test-world.com.",
      "records": [
        {"content": "3.3.3.3", "disabled": false}
      ],
      "ttl": 300,
      "type": "A",
    });
    assertEquals(result.rrsets[1].type, 'SOA');
  }

  {
    await applyToProvider(provider, registry, [{
      annotations: {},
      resourceKey: 'test',
      dns: {
        fqdn: 'www.test-world.com',
        type: 'A',
        target: '3.3.3.3',
      },
    }, {
      annotations: {},
      resourceKey: 'test',
      dns: {
        fqdn: 'www.test-world.com',
        type: 'A',
        target: '4.4.4.4',
      },
    }]);

    const result = await provider.api.getZone('test-world.com');
    assertEquals(result.rrsets.length, 2);
    assertObjectMatch(result.rrsets[0], {
      "name": "www.test-world.com.",
      "records": [
        {"content": "3.3.3.3", "disabled": false},
        {"content": "4.4.4.4", "disabled": false},
      ],
      "ttl": 300,
      "type": "A",
    });
    assertEquals(result.rrsets[1].type, 'SOA');
  }

  {
    await applyToProvider(provider, registry, [{
      annotations: {},
      resourceKey: 'test',
      dns: {
        fqdn: 'www.test-world.com',
        type: 'CNAME',
        target: 'test-world.com',
      },
    }]);

    const result = await provider.api.getZone('test-world.com');
    assertEquals(result.rrsets.length, 2);
    assertObjectMatch(result.rrsets[0], {
      "name": "www.test-world.com.",
      "records": [
        {"content": "test-world.com.", "disabled": false}
      ],
      "ttl": 300,
      "type": "CNAME",
    });
    assertEquals(result.rrsets[1].type, 'SOA');
  }

  {
    await applyToProvider(provider, registry, []);

    const result = await provider.api.getZone('test-world.com');
    assertEquals(result.rrsets.length, 1);
    assertEquals(result.rrsets[0].type, 'SOA');
  }

});

Deno.test('PowerDNS integration test: MX', async () => {

  const provider = new PowerDnsProvider({
    type: 'powerdns',
    api_endpoint: 'http://localhost:7070/api/',
    domain_filter: ['test-world.com'],
  });
  await resetZone(provider, 'test-world.com');

  const registry = new NoopRegistry({type: 'noop'});

  {
    await applyToProvider(provider, registry, [{
      annotations: {},
      resourceKey: 'test',
      dns: {
        fqdn: 'test-world.com',
        type: 'MX',
        priority: 5,
        target: 'mx1',
      },
    }]);

    const result = await provider.api.getZone('test-world.com');
    assertEquals(result.rrsets.length, 2);
    assertObjectMatch(result.rrsets[0], {
      "name": "test-world.com.",
      "records": [
        {"content": "5 mx1.", "disabled": false},
      ],
      "ttl": 300,
      "type": "MX",
    });
    assertEquals(result.rrsets[1].type, 'SOA');
  }

  {
    await applyToProvider(provider, registry, [{
      annotations: {},
      resourceKey: 'test',
      dns: {
        fqdn: 'test-world.com',
        type: 'MX',
        priority: 5,
        target: 'mx1',
      },
    }, {
      annotations: {},
      resourceKey: 'test',
      dns: {
        fqdn: 'test-world.com',
        type: 'MX',
        priority: 10,
        target: 'mx2a',
      },
    }, {
      annotations: {},
      resourceKey: 'test',
      dns: {
        fqdn: 'test-world.com',
        type: 'MX',
        priority: 10,
        target: 'mx2b',
      },
    }]);

    const result = await provider.api.getZone('test-world.com');
    assertEquals(result.rrsets.length, 2);
    assertObjectMatch(result.rrsets[0], {
      "name": "test-world.com.",
      "records": [
        {"content": "10 mx2a.", "disabled": false},
        {"content": "10 mx2b.", "disabled": false},
        {"content": "5 mx1.", "disabled": false},
      ],
      "ttl": 300,
      "type": "MX",
    });
    assertEquals(result.rrsets[1].type, 'SOA');
  }

  {
    await applyToProvider(provider, registry, []);

    const result = await provider.api.getZone('test-world.com');
    assertEquals(result.rrsets.length, 1);
    assertEquals(result.rrsets[0].type, 'SOA');
  }

});

async function resetZone(provider: PowerDnsProvider, zoneName: string) {
  await provider.api._doHttp(`zones/${zoneName}.`, {
    method: 'DELETE',
  }).catch(() => console.log(`Test zone ${zoneName} did not exist yet, all good`));
  await provider.api._doHttp(`zones`, {
    method: 'POST',
    body: JSON.stringify({name: `${zoneName}.`, kind: 'Native'}),
  });
}

async function applyToProvider<Tsource extends BaseRecord, Tinner extends Tsource>(provider: DnsProvider<Tsource>, registry: DnsRegistry<Tsource, Tinner>, source: SourceRecord[]) {

  const zones = await provider.ListZones();
  assertEquals(zones.length, 1);

  const state = await registry.RecognizeLabels({
    Zone: zones[0],
    Existing: await provider.ListRecords(zones[0]),
    Desired: source
      .map(x => provider.EnrichSourceRecord(x))
      .flatMap(x => x ? [x] : []),
  });

  const secondState = await registry.CommitLabels(state);
  secondState.Diff = buildDiff(secondState, provider);
  await provider.ApplyChanges(secondState);
  return secondState;
}
