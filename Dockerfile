FROM hayd/alpine-deno

WORKDIR /src/kubernetes-dns-sync
ADD . ./
RUN deno cache controller/mod.ts

CMD ["deno", "run", "--allow-net", "--allow-read", "--allow-env", "--cert=/var/run/secrets/kubernetes.io/serviceaccount/ca.crt", "--cached-only", "controller/mod.ts"]
