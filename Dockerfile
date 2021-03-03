# FROM hayd/alpine-deno:1.8.0
FROM danopia/deno-experiments:1.8.0-heapmetrics

WORKDIR /src/kubernetes-dns-sync
ADD . ./
RUN ["deno", "cache", "controller/mod.ts"]

ENTRYPOINT ["deno", "run", "--unstable", "--allow-hrtime", "--allow-net", "--allow-read", "--allow-env", "--cached-only", "controller/mod.ts"]
