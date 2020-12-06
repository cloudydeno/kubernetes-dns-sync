# kubernetes-dns-sync

## Work In Progress!!

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
