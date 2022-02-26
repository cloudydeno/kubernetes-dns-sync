# kubernetes-dns-sync

[![Custom badge](https://img.shields.io/endpoint?url=https%3A%2F%2Fdeno-visualizer.danopia.net%2Fshields%2Fdep-count%2Fgh%2Fcloudydeno%2Fkubernetes-dns-sync%2Fsrc%2Fmain.ts)][deno-vis]
[![Custom badge](https://img.shields.io/endpoint?url=https%3A%2F%2Fdeno-visualizer.danopia.net%2Fshields%2Fupdates%2Fgh%2Fcloudydeno%2Fkubernetes-dns-sync%2Fsrc%2Fmain.ts)][deno-vis]

[deno-vis]: https://deno-visualizer.danopia.net/dependencies-of/https/raw.githubusercontent.com/cloudydeno/kubernetes-dns-sync/main/src/main.ts?rankdir=LR

An `external-dns`-like project, with a wider scope for managing DNS records.
Targets small-to-medium Kubernetes clusters.
Written in Typescript.

## Work In Progress!!

I haven't started semantic versioning on this project yet.
Only githash containers have been published so far.
An initial versioned release will be made in the coming weeks.

For rationale of creating my own DNS manager project,
see [Why make another external-dns?](https://github.com/cloudydeno/kubernetes-dns-sync/wiki/Comparison-with-external-dns).

## Configuration

A `config.toml` file is currently used to configure sources and providers, and also a TXT registry.
There are also a couple top-level options which you can add at the top of the file.

The configuration format and available options are documented in the Wiki:
[TOML Configuration](https://github.com/cloudydeno/kubernetes-dns-sync/wiki/TOML-Configuration).

### Command-line Flags

* `--dry-run`: don't actually make any changes, only print them
* `--yes`: commit changes to DNS provider APIs without asking
* `--once`: one run only, the process exits when complete
* `--serve-metrics`: start an OpenMetrics/Prometheus server with runtime metrics on port 9090
* `--debug`: enable extra logging
* `--log-as-json`: structured logging as JSON log lines

The default behavior
(if neither `--dry-run` nor `--yes` are supplied)
is to print the planned changes and
interactively ask the user before applying them.

## Supported functionality

### DNS records by source:

The types of DNS records that each source is able to emit.

|         | acme-crd | crd | ingress | node |
|---------|----------|-----|---------|------|
| `A`     |          | ✅  | ✅      | ✅   |
| `AAAA`  |          | ✅  | ✅      | ✅   |
| `NS`    |          | ✅  |         |      |
| `CNAME` |          | ✅  | ✅      |      |
| `TXT`   | ✅       | ✅  |         |      |
| `MX`    |          | ✅  |         |      |
| `SOA`   |          | ✅  |         |      |
| `SRV`   |          | ✅  |         |      |

### DNS records by providers:

Most providers support all of our managable record types.

|         | cloudflare | google | powerdns | route53 | vultr |
|---------|------------|--------|----------|---------|-------|
| `A`     | ✅         | ✅     | ✅       | ✅      | ✅    |
| `AAAA`  | ✅         | ✅     | ✅       | ✅      | ✅    |
| `NS`    | ✅         | ✅     | ✅       | ✅      | ✅    |
| `CNAME` | ✅         | ✅     | ✅       | ✅      | ✅    |
| `TXT`   | ✅         | ✅     | ✅       | ✅      | ✅    |
| `MX`    | ✅         | ✅     | ✅       | ✅      | ✅    |
| `SOA`   | *          | ✅     | ✅       | ✅      | *     |
| `SRV`   | ✅         | ✅     | ✅       | ✅      | ✅    |

*: These providers do not expose the zone's SOA record for modification.

### Record sources

| Source type | Kubernetes Kind | Target APIVersion             | Primary usage |
|-------------|-----------------|-------------------------------|---------------|
| `ingress`   | `Ingress`       | `networking.k8s.io/v1`        | Serving HTTP traffic |
| `crd`       | `DNSEndpoint`   | `externaldns.k8s.io/v1alpha1` | Managing arbitrary DNS records |
| `acme-crd`  | `Challenge`     | `acme.cert-manager.io/v1`     | Solving DNS01 challenges |
| `node`      | `Node`          | `v1`                          | 'Dynamic DNS' for your Nodes |

See [Configuring Sources](https://github.com/cloudydeno/kubernetes-dns-sync/wiki/Configuring-Sources)
for more information about using the available record sources.

All sources can be configured with their own `annotation_filter`.

### DNS providers

| Provider type | Integration quality | Update strategy     | Integrates with |
|---------------|---------------------|---------------------|-----------------|
| `cloudflare`  | beta                | record-by-record    | [Cloudflare DNS](https://www.cloudflare.com/dns/) |
| `vultr`       | stable              | record-by-record    | [Vultr: "The Infrastructure Cloud"](https://www.vultr.com/) |
| `route53`     | beta                | atomic patches      | [Amazon Route53](https://aws.amazon.com/route53/) |
| `google`      | stable              | atomic replacements | [Google Cloud DNS](https://cloud.google.com/dns) |
| `powerdns`    | beta                | atomic patches      | [PowerDNS](https://github.com/PowerDNS/pdns) (self-hostable) |

I'd be open to adding and/or merging more providers (such as
Namecheap,
Gandi,
etc). Just file a ticket with a link to the API and I'll evaluate it.

See [Configuring Providers](https://github.com/cloudydeno/kubernetes-dns-sync/wiki/Configuring-Providers)
for more information about using the available DNS providers.

## `external-dns` Compatability

This project is mostly compatible with DNS zones previously managed by external-dns,
with similar TXT "Registry" support.
The primary difference is that each record type is now explicitly registered/owned.
This means that if a managed subdomain already has extra records such as `MX`,
`kubernetes-dns-sync` will initially assume it is supposed to manage the extra records.

This record type ownership is only a concern when inheriting `external-dns` registry records.
See [`TXT` Registry Compatibility](https://github.com/cloudydeno/kubernetes-dns-sync/wiki/Comparison-with-external-dns#txt-registry)
for more details.

## Running functional tests
Some provider tests actually communicate with a live API. These are not included in the default test suite.

The individual functional tests can be launched directly from a shell:

```
src/providers/vultr/functional-test.ts
src/providers/powerdns/functional-test.ts
```

All other tests will be found by a simple `deno test` invocation.
