FROM denoland/deno:alpine-1.18.0
WORKDIR /src/kubernetes-dns-sync

ADD src/deps.ts ./
RUN ["deno", "cache", "deps.ts"]

ADD src/ ./
RUN ["deno", "cache", "controller/mod.ts"]

ENTRYPOINT ["deno", "run", "--unstable", "--allow-hrtime", "--allow-net", "--allow-read", "--allow-env", "--cached-only", "--no-check", "controller/mod.ts"]
