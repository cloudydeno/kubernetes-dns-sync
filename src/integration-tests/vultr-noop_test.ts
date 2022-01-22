import { mockedVultrTest } from "./vultr-mock.ts";

Deno.test("[E2E: Vultr & noop] Update changed A record",
  async () => await mockedVultrTest({
    registry: { type: 'noop', },
    sourceRecords: [{
      annotations: {},
      resourceKey: 'e2e',
      dns: {
        fqdn: "www.example.com",
        type: "A",
        target: '2.2.2.2',
      },
    }],
  }).withZone('example.com', [{
    expect: 'deletion',
    data: { name: 'www', type: 'A', data: '1.1.1.1' },
  }, {
    expect: 'creation',
    data: { name: 'www', type: 'A', data: '2.2.2.2' },
  }]).go());

Deno.test("[E2E: Vultr & noop] Clean up unrelated records",
  async () => await mockedVultrTest({
    registry: { type: 'noop', },
    sourceRecords: [{
      annotations: {},
      resourceKey: 'e2e',
      dns: {
        fqdn: "www.example.com",
        type: "A",
        target: '1.1.1.1',
      },
    }],
  }).withZone('example.com', [{
    // noop registry shouldn't try removing the zone's identity records
    expect: 'retained',
    data: { name: '', type: 'NS', data: 'ns1.website' },
  }, {
    expect: 'retained',
    data: { name: 'www', type: 'A', data: '1.1.1.1' },
  }, {
    expect: 'deletion',
    data: { name: 'www', type: 'A', data: '2.2.2.2' },
  }, {
    expect: 'deletion',
    data: { name: 'asdf', type: 'A', data: '3.3.3.3' },
  }, {
    expect: 'deletion',
    data: { name: '', type: 'MX', data: '5 mx.website' },
  }]).go());
