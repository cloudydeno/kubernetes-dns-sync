export abstract class JsonClient {
  constructor(
    public readonly name: string,
    public readonly baseUrl: string | URL,
  ) {}

  protected abstract addAuthHeaders(headers: Headers): void | Promise<void>;

  protected async doHttp<T>(opts: RequestInit & {
    path: string;
    query?: URLSearchParams;
    jsonBody?: unknown;
  }) {
    let path = opts.path;
    if (opts.query?.toString()) {
      path += (path.includes('?') ? '&' : '?') + opts.query.toString();
    }

    const headers = new Headers(opts.headers);
    await this.addAuthHeaders(headers);
    headers.set('accept', `application/json`);

    const body = opts.jsonBody ? JSON.stringify(opts.jsonBody) : undefined;
    if (body) headers.set('content-type', 'application/json');

    const method = opts.method ?? 'GET';
    const resp = await fetch(new URL(path, this.baseUrl), {
      body,
      ...opts,
      headers,
    });

    console.debug(`${method} ${this.name} ${path} ${resp.status}`);

    if (resp.status == 204) {
      resp.body?.cancel();
      return {} as T;
    } else if (resp.status >= 400) {
      const text = await resp.text();
      throw new Error(`HTTP ${resp.status} ${resp.statusText} from ${this.name}: ${text}`);
    }
    const data: T = await resp.json();
    return data;
  }
}
