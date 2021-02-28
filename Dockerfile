# FROM hayd/alpine-deno:1.6.1
FROM danopia/deno-experiments:per_op_metrics

WORKDIR /src/kubernetes-dns-sync
ADD . ./
RUN ["deno", "cache", "controller/mod.ts"]

ENTRYPOINT ["deno", "run", "--unstable", "--allow-hrtime", "--allow-net", "--allow-read", "--allow-env", "--cached-only", "controller/mod.ts"]
