import type { FetchLike } from "./types";

export class ErpHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly url: string,
    public readonly body: string,
  ) {
    super(message);
    this.name = "ErpHttpError";
  }
}

export interface HttpClientOptions {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  /** Headers added to every request (auth, api keys, tenant config) */
  headers?: Record<string, string>;
}

/**
 * Minimal JSON HTTP client shared by the connectors: timeout, consistent errors,
 * and an injectable fetch so the connectors can be unit-tested without a live ERP.
 */
export class HttpClient {
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private headers: Record<string, string>;

  constructor(options: HttpClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.headers = { Accept: "application/json", ...(options.headers ?? {}) };
  }

  setHeader(name: string, value: string | undefined) {
    if (value === undefined) delete this.headers[name];
    else this.headers[name] = value;
  }

  async getJson<T = any>(url: string, extraHeaders: Record<string, string> = {}): Promise<T> {
    return this.request<T>("GET", url, undefined, extraHeaders);
  }

  async postForm<T = any>(url: string, form: Record<string, string>, extraHeaders: Record<string, string> = {}): Promise<T> {
    return this.request<T>("POST", url, new URLSearchParams(form).toString(), {
      "Content-Type": "application/x-www-form-urlencoded",
      ...extraHeaders,
    });
  }

  private async request<T>(method: string, url: string, body: string | undefined, extraHeaders: Record<string, string>): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        method,
        headers: { ...this.headers, ...extraHeaders },
        body,
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        throw new ErpHttpError(`${method} ${redact(url)} -> HTTP ${response.status} ${response.statusText}`, response.status, url, text.slice(0, 2000));
      }
      if (!text) return undefined as T;
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new ErpHttpError(`${method} ${redact(url)} returned non-JSON body`, response.status, url, text.slice(0, 500));
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        throw new ErpHttpError(`${method} ${redact(url)} timed out after ${this.timeoutMs}ms`, 0, url, "");
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Strip credentials that may appear in a URL path (SyteLine on-prem token endpoint) before logging */
export function redact(url: string): string {
  return url.replace(/(\/ido\/token\/[^/]+\/)[^/]+\/[^/?]+/i, "$1***/***");
}

/** OData-style single-quoted literal */
export function odataString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
