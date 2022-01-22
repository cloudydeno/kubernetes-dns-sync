#!/usr/bin/env -S deno test --allow-env --allow-net=api.vultr.com

import { assertEquals, assertObjectMatch } from "https://deno.land/std@0.105.0/testing/asserts.ts";
import { applyToProvider } from "../../common/test-utils.ts";
import { NoopRegistry } from "../../registries/noop.ts";
import { VultrProvider } from "./mod.ts";

Deno.test('Vultr integration test', async () => {

  const provider = new VultrProvider({
    type: 'vultr',
    domain_filter: ['kubernetes-dns-sync.com'],
  });
  await resetZone(provider, 'kubernetes-dns-sync.com');

  const registry = new NoopRegistry({type: 'noop'});

  {
    await applyToProvider(provider, registry, [{
      annotations: {},
      resourceKey: 'test',
      dns: {
        fqdn: 'www.kubernetes-dns-sync.com',
        type: 'A',
        target: '2.2.2.2',
      },
    }]);

    const result = await provider.ListRecords({ DNSName: 'kubernetes-dns-sync.com', ZoneID: 'kubernetes-dns-sync.com' }).then(x => x.filter(y => y.dns.type !== 'NS'));
    assertEquals(result.length, 1);
    assertObjectMatch(result[0].dns, {
      "fqdn": "www.kubernetes-dns-sync.com",
      "target": "2.2.2.2",
      "ttl": 120,
      "type": "A",
    });
  }

  {
    await applyToProvider(provider, registry, [{
      annotations: {},
      resourceKey: 'test',
      dns: {
        fqdn: 'www.kubernetes-dns-sync.com',
        type: 'A',
        target: '3.3.3.3',
      },
    }]);

    const result = await provider.ListRecords({ DNSName: 'kubernetes-dns-sync.com', ZoneID: 'kubernetes-dns-sync.com' }).then(x => x.filter(y => y.dns.type !== 'NS'));
    assertEquals(result.length, 1);
    assertObjectMatch(result[0].dns, {
      "fqdn": "www.kubernetes-dns-sync.com",
      "target": "3.3.3.3",
      "ttl": 120,
      "type": "A",
    });
  }

  {
    await applyToProvider(provider, registry, [{
      annotations: {},
      resourceKey: 'test',
      dns: {
        fqdn: 'www.kubernetes-dns-sync.com',
        type: 'A',
        target: '3.3.3.3',
        ttl: 300,
      },
    }]);

    const result = await provider.ListRecords({ DNSName: 'kubernetes-dns-sync.com', ZoneID: 'kubernetes-dns-sync.com' }).then(x => x.filter(y => y.dns.type !== 'NS'));
    assertEquals(result.length, 1);
    assertObjectMatch(result[0].dns, {
      "fqdn": "www.kubernetes-dns-sync.com",
      "target": "3.3.3.3",
      "ttl": 300,
      "type": "A",
    });
  }

  {
    await applyToProvider(provider, registry, [{
      annotations: {},
      resourceKey: 'test',
      dns: {
        fqdn: 'www.kubernetes-dns-sync.com',
        type: 'A',
        target: '3.3.3.3',
      },
    }, {
      annotations: {},
      resourceKey: 'test',
      dns: {
        fqdn: 'www.kubernetes-dns-sync.com',
        type: 'A',
        target: '4.4.4.4',
      },
    }]);

    const result = await provider.ListRecords({ DNSName: 'kubernetes-dns-sync.com', ZoneID: 'kubernetes-dns-sync.com' }).then(x => x.filter(y => y.dns.type !== 'NS'));
    assertEquals(result.length, 2);
    assertObjectMatch(result[0].dns, {
      "fqdn": "www.kubernetes-dns-sync.com",
      "target": "3.3.3.3",
      "ttl": 120,
      "type": "A",
    });
    assertObjectMatch(result[1].dns, {
      "fqdn": "www.kubernetes-dns-sync.com",
      "target": "4.4.4.4",
      "ttl": 120,
      "type": "A",
    });
  }

  {
    await applyToProvider(provider, registry, [{
      annotations: {},
      resourceKey: 'test',
      dns: {
        fqdn: 'www.kubernetes-dns-sync.com',
        type: 'CNAME',
        target: 'kubernetes-dns-sync.com',
      },
    }]);

    const result = await provider.ListRecords({ DNSName: 'kubernetes-dns-sync.com', ZoneID: 'kubernetes-dns-sync.com' }).then(x => x.filter(y => y.dns.type !== 'NS'));
    assertEquals(result.length, 1);
    assertObjectMatch(result[0].dns, {
      "fqdn": "www.kubernetes-dns-sync.com",
      "target": "kubernetes-dns-sync.com",
      "ttl": 120,
      "type": "CNAME",
    });
  }

  {
    await applyToProvider(provider, registry, []);

    const result = await provider.ListRecords({ DNSName: 'kubernetes-dns-sync.com', ZoneID: 'kubernetes-dns-sync.com' }).then(x => x.filter(y => y.dns.type !== 'NS'));
    assertEquals(result.length, 0);
  }

});

Deno.test('Vultr integration test: MX', async () => {

  const provider = new VultrProvider({
    type: 'vultr',
    domain_filter: ['kubernetes-dns-sync.com'],
  });
  await resetZone(provider, 'kubernetes-dns-sync.com');

  const registry = new NoopRegistry({type: 'noop'});

  {
    await applyToProvider(provider, registry, [{
      annotations: {},
      resourceKey: 'test',
      dns: {
        fqdn: 'kubernetes-dns-sync.com',
        type: 'MX',
        priority: 5,
        target: 'mx1',
      },
    }]);

    const result = await provider.ListRecords({ DNSName: 'kubernetes-dns-sync.com', ZoneID: 'kubernetes-dns-sync.com' }).then(x => x.filter(y => y.dns.type !== 'NS'));
    assertEquals(result.length, 1);
    console.log(result[0])
    assertObjectMatch(result[0].dns, {
      "fqdn": "kubernetes-dns-sync.com",
      "priority": 5,
      "target": "mx1",
      "ttl": 120,
      "type": "MX",
    });
  }

  {
    await applyToProvider(provider, registry, [{
      annotations: {},
      resourceKey: 'test',
      dns: {
        fqdn: 'kubernetes-dns-sync.com',
        type: 'MX',
        priority: 5,
        target: 'mx1',
      },
    }, {
      annotations: {},
      resourceKey: 'test',
      dns: {
        fqdn: 'kubernetes-dns-sync.com',
        type: 'MX',
        priority: 10,
        target: 'mx2a',
      },
    }, {
      annotations: {},
      resourceKey: 'test',
      dns: {
        fqdn: 'kubernetes-dns-sync.com',
        type: 'MX',
        priority: 10,
        target: 'mx2b',
      },
    }]);

    const result = await provider.ListRecords({ DNSName: 'kubernetes-dns-sync.com', ZoneID: 'kubernetes-dns-sync.com' }).then(x => x.filter(y => y.dns.type !== 'NS'));
    assertEquals(result.length, 3);
    assertObjectMatch(result[0].dns, {
      "fqdn": "kubernetes-dns-sync.com",
      "priority": 5,
      "target": "mx1",
      "ttl": 120,
      "type": "MX",
    });
    assertObjectMatch(result[1].dns, {
      "fqdn": "kubernetes-dns-sync.com",
      "priority": 10,
      "target": "mx2a",
      "ttl": 120,
      "type": "MX",
    });
    assertObjectMatch(result[2].dns, {
      "fqdn": "kubernetes-dns-sync.com",
      "priority": 10,
      "target": "mx2b",
      "ttl": 120,
      "type": "MX",
    });
  }

  {
    await applyToProvider(provider, registry, []);

    const result = await provider.ListRecords({ DNSName: 'kubernetes-dns-sync.com', ZoneID: 'kubernetes-dns-sync.com' }).then(x => x.filter(y => y.dns.type !== 'NS'));
    assertEquals(result.length, 0);
  }

});

async function resetZone(provider: VultrProvider, zoneName: string) {
  // await provider.api._doHttp(`zones/${zoneName}.`, {
  //   method: 'DELETE',
  // }).catch(() => console.log(`Test zone ${zoneName} did not exist yet, all good`));
  // await provider.api._doHttp(`zones`, {
  //   method: 'POST',
  //   body: JSON.stringify({name: `${zoneName}.`, kind: 'Native'}),
  // });
}
