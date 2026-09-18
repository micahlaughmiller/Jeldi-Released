import type { FetchLike } from "../types";

export interface Route {
  /** Substring the decoded request URL must contain; "" matches anything (put it last) */
  match: string;
  status?: number;
  body: unknown;
  /** Optional assertion hook on the request */
  onRequest?: (url: string, init?: RequestInit) => void;
}

export interface RecordedCall {
  url: string;
  init?: RequestInit;
}

/** In-memory fetch that answers from an ordered route table and records every call */
export function fakeFetch(routes: Route[]): { fetchImpl: FetchLike; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetchImpl: FetchLike = async (input, init) => {
    const url = decodeURIComponent(input);
    calls.push({ url, init });
    const route = routes.find(r => r.match === "" || url.includes(r.match));
    if (!route) {
      return new Response("no route", { status: 404, statusText: "Not Found" });
    }
    route.onRequest?.(url, init);
    const status = route.status ?? 200;
    const body = typeof route.body === "string" ? route.body : JSON.stringify(route.body);
    return new Response(body, { status, statusText: status === 200 ? "OK" : "Error", headers: { "Content-Type": "application/json" } });
  };
  return { fetchImpl, calls };
}
