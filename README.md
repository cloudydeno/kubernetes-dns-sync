# kubernetes-dns-sync

[![Custom badge](https://img.shields.io/endpoint?url=https%3A%2F%2Fdeno-visualizer.danopia.net%2Fshields%2Fdep-count%2Fgh%2Fdanopia%2Fkubernetes-dns-sync%2Fcontroller%2Fmod.ts)][deno-vis]
[![Custom badge](https://img.shields.io/endpoint?url=https%3A%2F%2Fdeno-visualizer.danopia.net%2Fshields%2Fupdates%2Fgh%2Fdanopia%2Fkubernetes-dns-sync%2Fcontroller%2Fmod.ts)][deno-vis]

[deno-vis]: https://deno-visualizer.danopia.net/dependencies-of/https/raw.githubusercontent.com/danopia/kubernetes-dns-sync/main/controller/mod.ts?rankdir=LR

## Work In Progress!!

For rationale of creating my own external-dns-like project see the end of this README.

### Supported record sources

See below sections for more info on each source.

* `ingress` for `networking.k8s.io/v1` `Ingress`
* `crd` for `externaldns.k8s.io/v1alpha1` `DNSEndpoint`
* `acme-crd` for `acme.cert-manager.io/v1` `Challenge`
* `node` for `v1` `Node`

All sources can be configured with their own `annotation_filter`.

### Supported DNS providers

* [Vultr: "The Infrastructure Cloud"](https://www.vultr.com/)
* [Google Cloud DNS](https://cloud.google.com/dns)

I'd be open to adding and/or merging a couple others - in particular
AWS Route53,
Cloudflare,
Namecheap,
Gandi,
etc. but for my needs having one or two providers is plenty.

## Options

* `--dry-run`: don't actually make any changes, only print them
* `--yes`: commit changes to DNS provider APIs without asking
* `--once`: one run only, exits when done
* `--serve-metrics`: start an OpenMetrics/Prometheus server on port 9090

The default behavior
(if neither `--dry-run` nor `--yes` are supplied)
is to print the planned changes and
interactively ask the user before applying them.

## Sources

### `ingress`

The original. Furnishes DNS records for your `Ingress` resources.
You'll probably want to set your ingress class as an Annotation Filter,
especially if you have a split-horizon DNS configuration.

```toml
[[source]]
type = "ingress"
annotation_filter = { "\"kubernetes.io/ingress.class\"": "nginx" }
```

Note that broken-looking TOML syntax. Trust me, it works as is...
but eventually Deno's TOML parser will be fixed.
[I've filed an issue upstream](https://github.com/denoland/deno_std/issues/823).

### `crd`

Allows specifying highly custom records via the CRD from the `external-dns` project.

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

To use, configure your issuer with this dummy webhook:

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

I'm using this source to give each Node an Internet name.
This is essentially a Kubernetes-based Dynamic DNS arrangement.

In theory you can also use this for round robins,
but if you're hosting HTTP, the ingress source is probably what you want instead.

```toml
[[source]]
type = "node"
address_type = "ExternalIP"
fqdn_template = "{{index .Labels \"kubernetes.io/hostname\"}}.pet.devmode.cloud"
annotation_filter = { "\"kubernetes.io/node.class\"": "pet" }
```

NOTE: The only interpolation currently allowed in `fqdn_template` is `{{ index .Labels .... }}`

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
