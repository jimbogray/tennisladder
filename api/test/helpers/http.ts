import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";
import { createApp } from "../../src/app.js";

let server: Server | undefined;
let baseUrl: string | undefined;

/** Boots the real Express app on an ephemeral port, once per test process. */
export async function apiBaseUrl(): Promise<string> {
  if (baseUrl) return baseUrl;
  server = createServer(createApp());
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
  return baseUrl;
}

export async function stopApi(): Promise<void> {
  if (!server) return;
  server.close();
  await once(server, "close");
  server = undefined;
  baseUrl = undefined;
}

export interface ApiResponse<T = any> {
  status: number;
  body: T;
}

let clientCount = 0;

/**
 * One caller, with its own cookie jar and its own client IP.
 *
 * The IP matters: the rate limiters are module-level singletons keyed off `req.ip`, so without a
 * distinct address per client the twentieth registration in the process would start getting 429s
 * from a limiter another test filled up. `trust proxy` is on (see createApp), so X-Forwarded-For
 * is what the limiters see.
 */
export function apiClient() {
  const cookies = new Map<string, string>();
  clientCount += 1;
  const clientIp = `203.0.113.${clientCount % 254}`;

  async function request<T = any>(
    method: string,
    path: string,
    options: { body?: unknown; accessToken?: string } = {},
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = { "X-Forwarded-For": clientIp };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`;
    if (cookies.size > 0) {
      headers.Cookie = [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
    }

    const response = await fetch(`${await apiBaseUrl()}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(";");
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      // An empty value is the server clearing the cookie, which the browser would drop too.
      if (value === "") cookies.delete(name);
      else cookies.set(name, value);
    }

    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : undefined };
  }

  return {
    get: <T = any>(path: string, options?: { accessToken?: string }) =>
      request<T>("GET", path, options),
    post: <T = any>(path: string, body?: unknown, options?: { accessToken?: string }) =>
      request<T>("POST", path, { ...options, body }),
    hasCookie: (name: string) => cookies.has(name),
    cookie: (name: string) => cookies.get(name),
    setCookie: (name: string, value: string) => cookies.set(name, value),
  };
}
