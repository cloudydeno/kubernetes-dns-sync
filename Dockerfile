FROM denoland/deno:alpine-1.17.0
WORKDIR /src/kubernetes-dns-sync

ADD deps.ts ./
RUN ["deno", "cache", "deps.ts"]

ADD . ./
RUN ["deno", "cache", "controller/mod.ts"]

ENTRYPOINT ["deno", "run", "--allow-hrtime", "--allow-net", "--allow-read", "--allow-env", "--cached-only", "controller/mod.ts"]
