export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Builds a human-readable message from an error response body. Zod validation failures come back as
 * `{ error: "Validation failed", details: { fieldErrors } }` — that generic top-level message is
 * useless on its own, so flatten the per-field messages (e.g. "registrationCode: String must
 * contain exactly 4 character(s)") for the user instead.
 */
function errorMessage(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const { error, details } = body as {
    error?: string;
    details?: { fieldErrors?: Record<string, string[]> };
  };

  const fieldErrors = details?.fieldErrors;
  if (fieldErrors) {
    const messages = Object.values(fieldErrors).flatMap((msgs) => msgs ?? []);
    if (messages.length > 0) return messages.join("; ");
  }

  return error;
}

/**
 * The request half of apiFetch, for the rare caller that needs the Response itself (a stream)
 * rather than parsed JSON. Throws ApiError the same way on a non-2xx status.
 */
export async function apiRequest(path: string, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "include", // sends the httpOnly refresh cookie on same-origin API calls
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, errorMessage(body) ?? res.statusText);
  }

  return res;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await apiRequest(path, options);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
