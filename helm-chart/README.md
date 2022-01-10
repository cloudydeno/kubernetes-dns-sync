To view more information about this helm chart,
check out the [ArtifactHub](https://artifacthub.io/packages/helm/cloudydeno/dns-sync) page!

## Usage

This chart doesn't manage a Kubernetes `Secret` for you,
so you'll want to create any DNS provider API keys as your own secrets
and then you can mount them into the image with `envFrom:`.

You will want to specify a TOML config file as a multi-line Helm value.
