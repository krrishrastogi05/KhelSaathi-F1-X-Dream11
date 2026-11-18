// Transport-independent request and response shapes, plus helpers. api.ts works on these; server.ts maps node:http
// to them (and handles the SSE stream itself, because a stream is not a single response).
export interface Req { method: string; path: string; query: URLSearchParams; body: string | null; host: string }
export interface Res { status: number; headers: Record<string, string>; body: string }

/** An error that is safe to show to the client, with its HTTP status. */
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const json = (status: number, value: unknown): Res =>
  ({ status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, body: JSON.stringify(value) });

const MAX_BODY = 8_000;

export function parse(body: string | null): Record<string, unknown> {
  if (!body) throw new HttpError(400, 'Expected a JSON body');
  if (body.length > MAX_BODY) throw new HttpError(413, 'Request body is too large');
  let v: unknown;
  try { v = JSON.parse(body); } catch { throw new HttpError(400, 'Body is not valid JSON'); }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new HttpError(400, 'Expected a JSON object');
  return v as Record<string, unknown>;
}
