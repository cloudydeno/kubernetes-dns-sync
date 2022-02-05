# kubernetes-dns-sync

[![Custom badge](https://img.shields.io/endpoint?url=https%3A%2F%2Fdeno-visualizer.danopia.net%2Fshields%2Fdep-count%2Fgh%2Fcloudydeno%2Fkubernetes-dns-sync%2Fsrc%2Fcontroller%2Fmod.ts)][deno-vis]
[![Custom badge](https://img.shields.io/endpoint?url=https%3A%2F%2Fdeno-visualizer.danopia.net%2Fshields%2Fupdates%2Fgh%2Fcloudydeno%2Fkubernetes-dns-sync%2Fsrc%2Fcontroller%2Fmod.ts)][deno-vis]

[deno-vis]: https://deno-visualizer.danopia.net/dependencies-of/https/raw.githubusercontent.com/cloudydeno/kubernetes-dns-sync/main/src/controller/mod.ts?rankdir=LR

## Work In Progress!!

For rationale of creating my own external-dns-like project see the end of this README.

### `external-dns` Compatability

This project is mostly compatible with DNS zones previously managed by external-dns,
with similar TXT "Registry" support.
The primary difference is that each record type is now explicitly registered/owned.
This means that if a managed subdomain already has extra records such as `MX`,
`kubernetes-dns-sync` will initially assume it is supposed to manage the extra records.

This record type ownership is only a concern when there are existing `external-dns` records.

### Supported record sources

See below sections for more info on each source.

* `ingress` for `networking.k8s.io/v1` `Ingress`
* `crd` for `externaldns.k8s.io/v1alpha1` `DNSEndpoint`
* `acme-crd` for `acme.cert-manager.io/v1` `Challenge`
* `node` for `v1` `Node`

All sources can be configured with their own `annotation_filter`.

### Supported DNS providers

* [Cloudflare](https://www.cloudflare.com/dns/) (beta stage)
* [Vultr: "The Infrastructure Cloud"](https://www.vultr.com/) (stable stage)
* [Amazon Route53](https://aws.amazon.com/route53/) (beta stage)
* [Google Cloud DNS](https://cloud.google.com/dns) (stable stage)
* [PowerDNS](https://github.com/PowerDNS/pdns) (beta stage)

I'd be open to adding and/or merging more providers (such as
Namecheap,
Gandi,
etc). Just file a ticket with a link to the API and I'll evaluate it.

## Options

* `--dry-run`: don't actually make any changes, only print them
* `--yes`: commit changes to DNS provider APIs without asking
* `--once`: one run only, exits when done
* `--serve-metrics`: start an OpenMetrics/Prometheus server on port 9090
* `--debug`: enable extra logging
* `--log-as-json`: structured logging as JSON log lines

The default behavior
(if neither `--dry-run` nor `--yes` are supplied)
is to print the planned changes and
interactively ask the user before applying them.

## Providers

In general, providers require no extra configuration
other than a token/credential via an environment variable.

There's always at least one option available (`domain_filter`)
for filtering which zones will be synced.

### `cloudflare`
Generate a Cloudflare API Token (the "edit DNS" sample is perfect)
and set it as the `CLOUDFLARE_TOKEN` environment variable.

```toml
[[provider]]
type = "cloudflare"

### Have traffic go through Cloudflare's CDN by default?
### This can also be set per-record with an Kubernetes annotation, see below
proxied_by_default = true
### If you want to have proxied *wildcards* and you pay for Cloudflare Enterprise:
# allow_proxied_wildcards = false

### These let you give specific IDs instead of finding what you can access
# account_id = ["zjh..etc..aio"]
# zone_id_filter = ["058..etc..90q"]
### This filters the list of zones that was found
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
# zone_id_filter = ["058..etc..90q"]
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
If you want better auth, please ask :)

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
type = "powerdns"
# api_endpoint = "http://localhost:8081/api/" # default
# server_id = "localhost" # default
# domain_filter = ["danopia.net"]
```

## Sources

### `ingress`

The original. Furnishes DNS records for your `Ingress` resources.
You'll probably want to set your ingress class as an Annotation Filter,
especially if you have a split-horizon DNS configuration.

```toml
[[source]]
type = "ingress"
annotation_filter = { "kubernetes.io/ingress.class" = "nginx" }
```

This project uses the `Ingress` kind from `networking.k8s.io/v1`,
which was introduced in Kubernetes v1.19.
If your cluster is older, consider upgrading,
or perhaps try [an older snapshot](https://github.com/cloudydeno/kubernetes-dns-sync/tree/6b7cff80007fac8189d97bbaaade808a81fd01c3) of this project
which can still use `networking.k8s.io/v1beta1` (added in Kubernetes v1.14).

### `crd`

Allows specifying highly custom records via the CRD from the `external-dns` project.

The CRD's manifest [can be found upstream](https://github.com/kubernetes-sigs/external-dns/blob/master/docs/contributing/crd-source/crd-manifest.yaml). Create this CRD in your cluster before enabling the `crd` source in your configuration.

```toml
[[source]]
type = "crd"
```

### `acme-crd`

This source specifically targets cert-manager's v1 `Challenge` CRD.

```toml
[[source]]
type = "acme-crd"
challenge_ttl = 120
allow_wildcards = true
```

To use, configure a cert-manager `Issuer` / `ClusterIssuer` with this dummy webhook solver:

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

This

This is effectively a Kubernetes-based Dynamic DNS arrangement.
I'm using this source to give each Node an Internet name.

In theory you can also use this for hosting round-robin endpoints,
but if you're serving HTTP, the ingress source is probably what you want instead.

```toml
[[source]]
type = "node"
# required: a FQDN pattern for each node
# If an "index" interpolation doesn't match, that node is skipped
fqdn_template = "{{index .Labels \"kubernetes.io/hostname\"}}.pet.devmode.cloud"
address_type = "ExternalIP"
annotation_filter = { "kubernetes.io/node.class" = "pet" }
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
1. CRD source doesn't have a field for priority / weight
1. CRD source doesn't provide strong feedback in Status key
1. Need to run multiple external-dns instances for multi-provider, differing annotation filters, etc
    1. I'm up to 5 right now for split-horizon... Should only be 2
1. Individual providers like Vultr can be quite behind
    1. Vultr provider entirely lacks multiple-target support (DNS round-robin)
    1. Vultr provider continuously updates on invalid TTL
    1. Vultr is using v1 of their API and makes repetetitive calls; v2 is the latest API version now

After trying to refactor enough to support several of these needs, I decided to to my hand at a from-scratch replacement. Even if it doesn't work I'll hopefully learn why things are so hard to begin with.

I'm considering a few differences - such as allowing a DynamoDB table for ownership instead of TXT records - but overall the basic loop reflects how external-dns works. CRDs and heritage TXT records will stay compatible.

## Running functional tests
Some provider tests actually communicate with a live API. These are not included in the default test suite.

The individual functional tests can be launched directly:

```
src/providers/vultr/functional-test.ts
src/providers/powerdns/functional-test.ts
```
