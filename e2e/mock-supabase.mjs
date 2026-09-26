/*
 * A local stand-in for a Supabase project.
 *
 * The app talks to Supabase over plain HTTP: `supabase.auth.getUser()` is a
 * GET to `${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/user`, and every `.from(table)`
 * query is a PostgREST request to `${url}/rest/v1/<table>`. Neither is special
 * — so pointing NEXT_PUBLIC_SUPABASE_URL at this server gives the real server
 * code a real signed-in session and real rows, with no source changes and no
 * outbound network.
 *
 * This implements the slice of PostgREST the app actually uses: eq/neq/is/in/
 * gt/gte/lt/lte/like/ilike filters, `select=`, `order=`, `limit=`,
 * `Prefer: count=exact` (including HEAD), and insert/upsert/update/delete with
 * `Prefer: return=representation`.
 */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,HEAD,POST,PATCH,PUT,DELETE,OPTIONS",
  "access-control-expose-headers": "content-range, content-location",
};

function compare(a, b) {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  return a < b ? -1 : 1;
}

/* PostgREST encodes a value's type in the literal: `null`, `true`, `12`, `"x"`. */
function literal(raw) {
  if (raw === "null") return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw !== "" && !Number.isNaN(Number(raw))) return Number(raw);
  if (raw.startsWith('"') && raw.endsWith('"')) return raw.slice(1, -1);
  return raw;
}

function matches(row, column, op, raw) {
  const actual = row[column];
  const want = literal(raw);
  switch (op) {
    case "eq": return actual === want || String(actual) === String(want);
    case "neq": return String(actual) !== String(want);
    case "is": return want === null ? actual === null || actual === undefined : actual === want;
    case "gt": return compare(actual, want) > 0;
    case "gte": return compare(actual, want) >= 0;
    case "lt": return compare(actual, want) < 0;
    case "lte": return compare(actual, want) <= 0;
    case "in": {
      const list = raw.replace(/^\(|\)$/g, "").split(",").map((item) => String(literal(item)));
      return list.includes(String(actual));
    }
    case "like":
    case "ilike": {
      const pattern = new RegExp(`^${String(want).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".")}$`, op === "ilike" ? "i" : "");
      return pattern.test(String(actual ?? ""));
    }
    default: return true;
  }
}

function project(row, select) {
  if (!select || select === "*") return row;
  const columns = select.split(",").map((column) => column.trim()).filter((column) => column && column !== "*");
  if (!columns.length) return row;
  const out = {};
  for (const column of columns) out[column] = row[column] ?? null;
  return out;
}

export function createMockSupabase({ seed = {}, user, port = 0, onRequest } = {}) {
  /* Deep copy so one test run's writes never leak into the next. */
  const tables = new Map(Object.entries(structuredClone(seed)).map(([name, rows]) => [name, rows]));
  const requests = [];
  const rowsOf = (table) => {
    if (!tables.has(table)) tables.set(table, []);
    return tables.get(table);
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const send = (status, body, extra = {}) => {
      res.writeHead(status, { ...JSON_HEADERS, ...extra });
      res.end(req.method === "HEAD" ? undefined : body === undefined ? "" : JSON.stringify(body));
    };

    requests.push({ method: req.method, path: url.pathname, search: url.search });
    onRequest?.({ method: req.method, path: url.pathname, search: url.search });

    if (req.method === "OPTIONS") return send(204);

    /* ---------------- Auth ---------------- */
    if (url.pathname === "/auth/v1/user") {
      if (req.method === "GET") return send(200, user);
      return send(200, user);
    }
    if (url.pathname === "/auth/v1/token") {
      return send(200, { ...buildSession(user), user });
    }
    if (url.pathname === "/auth/v1/logout") return send(204);
    if (url.pathname.startsWith("/auth/v1/")) return send(200, {});

    /* ---------------- PostgREST ---------------- */
    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.slice("/rest/v1/".length);
      const prefer = req.headers.prefer ?? "";
      const wantsRepresentation = prefer.includes("return=representation");
      const wantsCount = /count=(exact|planned|estimated)/.test(prefer);
      const select = url.searchParams.get("select");

      const body = await readBody(req);
      const all = rowsOf(table);

      const filtered = all.filter((row) =>
        [...url.searchParams.entries()].every(([key, value]) => {
          if (["select", "order", "limit", "offset", "columns", "on_conflict"].includes(key)) return true;
          const [op, ...rest] = value.split(".");
          return matches(row, key, op, rest.join("."));
        }));

      if (req.method === "GET" || req.method === "HEAD") {
        let result = filtered;
        const order = url.searchParams.get("order");
        if (order) {
          for (const clause of order.split(",").reverse()) {
            const [column, ...modifiers] = clause.split(".");
            const descending = modifiers.includes("desc");
            result = [...result].sort((a, b) => (descending ? -1 : 1) * compare(a[column], b[column]));
          }
        }
        const limit = url.searchParams.get("limit");
        if (limit) result = result.slice(0, Number(limit));

        const headers = wantsCount
          ? { "content-range": `0-${Math.max(result.length - 1, 0)}/${filtered.length}` }
          : {};

        /* `.single()` asks for an object; `.maybeSingle()` unwraps an array itself. */
        if ((req.headers.accept ?? "").includes("vnd.pgrst.object+json")) {
          if (result.length !== 1) {
            return send(406, {
              code: "PGRST116",
              details: `Results contain ${result.length} rows`,
              hint: null,
              message: "JSON object requested, multiple (or no) rows returned",
            }, headers);
          }
          return send(200, project(result[0], select), headers);
        }
        return send(200, result.map((row) => project(row, select)), headers);
      }

      if (req.method === "POST") {
        const incoming = (Array.isArray(body) ? body : [body]).map((row) => ({ id: row.id ?? randomUUID(), ...row }));
        const conflictColumns = (url.searchParams.get("on_conflict") ?? "id").split(",");
        const merging = prefer.includes("resolution=merge-duplicates");
        const written = incoming.map((row) => {
          const index = all.findIndex((existing) => conflictColumns.every((column) => existing[column] === row[column]));
          if (index >= 0 && merging) {
            all[index] = { ...all[index], ...row };
            return all[index];
          }
          all.push(row);
          return row;
        });
        return send(wantsRepresentation ? 200 : 201, wantsRepresentation ? written.map((row) => project(row, select)) : undefined);
      }

      if (req.method === "PATCH") {
        const written = filtered.map((row) => Object.assign(row, body));
        return send(wantsRepresentation ? 200 : 204, wantsRepresentation ? written.map((row) => project(row, select)) : undefined);
      }

      if (req.method === "DELETE") {
        for (const row of filtered) all.splice(all.indexOf(row), 1);
        return send(wantsRepresentation ? 200 : 204, wantsRepresentation ? filtered : undefined);
      }
    }

    /* Storage is only reached by résumé download paths; a 404 is honest. */
    return send(404, { message: `mock-supabase: no handler for ${req.method} ${url.pathname}` });
  });

  return {
    server,
    requests,
    tables,
    listen: () => new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server.address().port))),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function readBody(req) {
  return new Promise((resolve) => {
    if (req.method === "GET" || req.method === "HEAD") return resolve(null);
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : null); } catch { resolve(null); }
    });
  });
}

/* A well-formed (unverified) JWT — nothing in the app checks the signature. */
function encodeSegment(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function buildAccessToken(user, expiresAt) {
  const header = encodeSegment({ alg: "HS256", typ: "JWT" });
  const payload = encodeSegment({
    sub: user.id,
    aud: "authenticated",
    role: "authenticated",
    email: user.email,
    app_metadata: user.app_metadata,
    user_metadata: user.user_metadata,
    iat: Math.floor(Date.now() / 1000) - 60,
    exp: expiresAt,
  });
  return `${header}.${payload}.e2e-not-a-real-signature`;
}

export function buildSession(user) {
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;
  return {
    access_token: buildAccessToken(user, expiresAt),
    refresh_token: "e2e-refresh-token",
    token_type: "bearer",
    expires_in: 60 * 60 * 24 * 365,
    expires_at: expiresAt,
    user,
  };
}
