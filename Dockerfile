FROM denoland/deno:alpine-1.30.1
WORKDIR /src/kubernetes-dns-sync

ADD src/deps.ts ./
RUN ["deno", "check", "deps.ts"]

ADD src/ ./
RUN ["deno", "check", "main.ts"]

ENTRYPOINT ["deno", "run", "--unstable", "--allow-hrtime", "--allow-net", "--allow-read", "--allow-env", "--cached-only", "main.ts"]
