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

For rationale of creating my own DNS manager project, see the end of this README.

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

See below sections for more info on each source.

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

### `external-dns` Compatability

This project is mostly compatible with DNS zones previously managed by external-dns,
with similar TXT "Registry" support.
The primary difference is that each record type is now explicitly registered/owned.
This means that if a managed subdomain already has extra records such as `MX`,
`kubernetes-dns-sync` will initially assume it is supposed to manage the extra records.

This record type ownership is only a concern when inheriting `external-dns` registry records.

## Command-line Flags

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

## Configuration file

A `config.toml` file is currently used to configure sources and providers, and also a TXT registry.
The below sections include TOML snippits to append to your configuration file to enable each integration.

There are also a couple top-level options which you can add at the top of the file.
These concern the timing of the syncronization loop:

```toml
# How often to start a sync even if nothing has visibly changed from a Source.
# This interval is useful for fixing any accidental changes on the Provider side.
# Defaults to 1 hour, or 1 minute if watching is disabled.
interval_seconds = 60

# Minimum time between event-triggered syncs.
# This helps deduplicate a batch update (a `kubectl apply` of multiple Ingresses).
# Defaults to 2 seconds. A higher value probably makes sense in a noisy cluster.
debounce_seconds = 2

# If you want to disable watching completely,
#   and only depend on `interval_seconds`, set this to true.
# A fresh list of resources will be downloaded from the API Server on every iteration.
# Possibly makes sense on super noisy clusters.
disable_watching = false
```

## Providers

In general, providers require no extra configuration
other than a token/credential via an environment variable.

There's always at least one option available
for filtering which zones will be synced (usually `domain_filter`).

### `cloudflare`
Generate a Cloudflare API Token (the "edit DNS" sample is perfect)
and set it as the `CLOUDFLARE_TOKEN` environment variable.

```toml
[[provider]]
type = "cloudflare"

### Have traffic go through Cloudflare's CDN by default?
### This can also be set per-record with an Kubernetes annotation, see below
proxied_by_default = true # default: false
### If you want to enable proxied *wildcards* and you pay for Cloudflare Enterprise:
# allow_proxied_wildcards = false

### These let you give specific IDs instead of discovering what the API token can access
# account_id = ["zjh[etc]aio"]
# zone_id_filter = ["058[etc]90q"]
### This filters the list of zones that was discovered
# domain_filter = ["danopia.net"]
```

To control proxy status (orange vs. gray cloud) on a per-record basis, use this annotation:

```yaml
metadata:
  annotations:
    external-dns.alpha.kubernetes.io/cloudflare-proxied: 'true'
```

If the annotation is present, proxying will be configured
based on the annotation value being equal to the string `"true"`.
If the annotation is not present then the default value will be used from the config.
If the configuration doesn't have a value then the default is `false`.

### Amazon `route53`
Auth is handled from the environment
(via environment variables, EC2 instance metadata, or Kubernetes IRSA).

```toml
[[provider]]
type = "route53"

### These filter the list of zones that was found
# zone_id_filter = ["058[etc]90q"]
# domain_filter = ["danopia.net"]

### Route53 is a 'global' service, so you shouldn't need this:
# region = "us-east-1"
```

### `vultr`
Generate an API Token
and set it as the `VULTR_API_KEY` environment variable.

```toml
[[provider]]
type = "vultr"

### This filters the list of zones that was found
# domain_filter = ["danopia.net"]
```

Vultr supports every dns-sync record type except `SOA`.

### `google`
For authentication, currently only the `GOOGLE_APPLICATION_CREDENTIALS` envvar is supported.
It must contain a path to a JSON file containing a `"type":"service_account"` credential.
The OAuth scopes `https://www.googleapis.com/auth/ndev.clouddns.{read,write}` will be used.
If you want more flexible auth, please ask :)

```toml
[[provider]]
type = "google"

### By default, the project is read from your service account's JSON data.
# project_id = "my-project-id"
### These filter which zones to pay attention to, by either DNS name or user-specified identifer
# domain_filter = ["danopia.net"]
# zone_filter = ["myzone-chosen-id"]
```

### `powerdns`
[PowerDNS](https://github.com/PowerDNS/pdns) is an open source authoritative DNS server.
So, unlike the other providers, you can run your own `powerdns` program
alongside `kubernetes-dns-sync` for local development purposes.

Set the `POWERDNS_API_KEY` envvar to authenticate.

```toml
[[provider]]
type = "powerdns"
# api_endpoint = "http://localhost:8081/api/" # default
# server_id = "localhost" # default
# domain_filter = ["danopia.net"]
```

## Sources

### `ingress`

The original. Furnishes DNS records for your `Ingress` resources.
You'll probably want to set a filter for your ingress class,
especially if you have a split-horizon DNS configuration.

Note that if both `ingress_class_names` and `annotation_filter` are set,
each `Ingress` will need to match both filters to be considered.
If you have a mix of ingress class styles,
you could perhaps add two `ingress` sources,
but it would be easier to make your resources consistent to one of the styles.

```toml
[[source]]
type = "ingress"

### optional: Set a list of `ingressClassName` values to filter Ingresses by
# ingress_class_names = [ "nginx" ]

### optional: Filter which resources we will manage records for
# annotation_filter = { "kubernetes.io/ingress.class" = "nginx" }
```

This project uses the `Ingress` kind from `networking.k8s.io/v1`,
which was introduced in Kubernetes v1.19.
If your cluster is older, consider upgrading it.

### `crd`

Allows specifying highly custom records via the CRD from the `external-dns` project.

To specify complex records such as `MX` or `SRV`, use the "rrdata" layout for that record type.
For example, a `SRV` target in a CRD could be: `10 5 5223 server.example.com`.
See [Google Cloud DNS docs](https://cloud.google.com/dns/docs/reference/json-record) for more examples.

The CRD's manifest [can be found upstream](https://github.com/kubernetes-sigs/external-dns/blob/master/docs/contributing/crd-source/crd-manifest.yaml).
Create this CRD in your cluster before enabling the `crd` source in your configuration.

```toml
[[source]]
type = "crd"

# annotation_filter = { "kubernetes.io/ingress.class" = "nginx" }
```

### `acme-crd`

This source specifically targets cert-manager's v1 `Challenge` CRD.
It presents ACME DNS01 Challenges without cert-manager having DNS provider details.

The configuration includes several optional fields:

```toml
[[source]]
type = "acme-crd"

### Set a optional TTL on challenges.
# challenge_ttl = 120

### Whether to allow wildcard certificates.
### Default `true`; set `false` to disallow
# allow_wildcards = false

### Note that this is matched to the annotations from the `Challenge` resource.
# annotation_filter = { ... }
```

To use, create a cert-manager `Issuer` or `ClusterIssuer` with this dummy webhook solver:

```yaml
    solvers:
    - dns01:
        webhook:
          groupName: kubernetes-dns-sync
          solverName: kubernetes-dns-sync
```

cert-manager won't like it but as long as kubernetes-dns-sync has correct permissions,
the `Challenge` should get presented anyway and allow the `Order` to succeed.

### `node`

This source requires a `fqdn_template` and uses it to compute DNS records
for the different Nodes in the Kubernetes cluster.

This is effectively a Kubernetes-based Dynamic DNS arrangement with `address_type = ExternalIP`.
It's also possible to use `address_type = InternalIP` to build an internal DNS zone.
If a node has multiple addresses of the desired type (e.g. dualstack IPv4/IPv6)
then each address will be extracted into a DNS target.

In theory you can also use this for hosting round-robin endpoints,
but if you're serving HTTP, the `ingress` source is probably what you want instead.

```toml
[[source]]
type = "node"

### required: A FQDN pattern for each node
### If an "index" interpolation doesn't match, that node is skipped
fqdn_template = "{{index .Labels \"kubernetes.io/hostname\"}}.pet.devmode.cloud"

# address_type = "ExternalIP" # default. Or "InternalIP"
# annotation_filter = { "kubernetes.io/node.class" = "workload" }
```

NOTE: The only interpolation currently allowed in `fqdn_template` is `{{ index .Labels "..." }}`

## Why?

I tried using `external-dns` for more serious DNS management (records for a whole zone; such as managing apex records pointing to dual-stack CDNs) and ran into numerous issues:

1. Lack of AAAA support from most sources (except AWS ALBs)
    1. For example: If a node has an IPv6 ExternalIP, external-dns tries adding as an A anyway
1. Lack of AAAA, TXT or MX 'planning' support overall
    1. external-dns can't be used to manage SPF even with the CRD source :(
1. Lack of partial ownership - won't add A to the apex record if TXTs already exist there
1. CRD source lacks event stream support
1. CRD source doesn't provide strong feedback in Status key
1. Need to run multiple external-dns instances for multi-provider, differing annotation filters, etc
    1. I was up to 5 for a split-horizon horizon... Should only be 2 at most
1. Individual providers like Vultr can be quite behind
    1. Vultr provider entirely lacks multiple-target support (DNS round-robin)
    1. Vultr provider continuously updates on invalid TTL
    1. At the time, vultr was using v1 of their API and making repetitive API calls; v2 is the latest API version

After trying to refactor enough to support several of these needs, I decided to to my hand at a from-scratch replacement.
I ended up learning a fair bit of the related issues in the process.
At this point

Overall there are some shared ideas between the two projects.
This project has a somewhat different design by now to enable a more flexible diff and registry system.
The `DNSEndpoint` CRD is compatible, and heritage `TXT` records are similar,
though this project's `TXT` registry keeps track of ownership on a per-recordtype level
which may hinder cooperation if both projects are used on the same zone in parallel.

## Running functional tests
Some provider tests actually communicate with a live API. These are not included in the default test suite.

The individual functional tests can be launched directly from a shell:

```
src/providers/vultr/functional-test.ts
src/providers/powerdns/functional-test.ts
```

All other tests will be found by a simple `deno test` invocation.
