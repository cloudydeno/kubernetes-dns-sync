#!/usr/bin/sh -eux

curl -o src/aws-api/route53.ts https://aws-api.deno.dev/v0.5/services/route53.ts?actions=ListHostedZones,ListResourceRecordSets,ChangeResourceRecordSets,GetChange'&useImportMap=yes'
