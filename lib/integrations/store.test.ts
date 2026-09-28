import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openSecret, sealSecret } from "@/lib/security/secret-cipher";

/*
 * The token store, against a recording stand-in for the database.
 *
 * What is asserted is the one thing the module exists for: nothing reaches
 * the table in the clear, and everything that comes out of it is opened
 * first. A row from before sealing existed is the important case — it has to
 * keep working the moment the key is set, and be sealed without anybody
 * running anything.
 */

type Row = Record<string, unknown>;
const table: { row: Row | null; upserts: Row[]; updates: Row[]; deletes: number } = { row: null, upserts: [], updates: [], deletes: 0 };

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table.row, error: null }) }) }) }),
      upsert: async (values: Row) => { table.upserts.push(values); table.row = { ...(table.row ?? {}), ...values }; return { error: null }; },
      update: (values: Row) => ({ eq: () => ({ eq: async () => { table.updates.push(values); table.row = { ...(table.row ?? {}), ...values }; return { error: null }; } }) }),
      delete: () => ({ eq: () => ({ eq: async () => { table.deletes += 1; table.row = null; return { error: null }; } }) }),
    }),
  }),
}));

const { connectionStatus, disconnectGoogle, googleAccessToken, saveGoogleConnection } = await import("./store");

const USER = "0f7f3f1e-2b4a-4c8d-9e1f-3a5b7c9d1e2f";
const KEY = randomBytes(32).toString("base64");
const OTHER_KEY = randomBytes(32).toString("base64");
const inAnHour = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();
const DRIVE = "https://www.googleapis.com/auth/drive.readonly";

const saved = {
  key: process.env.INTEGRATION_TOKEN_KEY,
  id: process.env.GOOGLE_CLIENT_ID,
  secret: process.env.GOOGLE_CLIENT_SECRET,
};

beforeEach(() => {
  process.env.INTEGRATION_TOKEN_KEY = KEY;
  process.env.GOOGLE_CLIENT_ID = "client-id";
  process.env.GOOGLE_CLIENT_SECRET = "client-secret";
  table.row = null;
  table.upserts = [];
  table.updates = [];
  table.deletes = 0;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  for (const [name, value] of [
    ["INTEGRATION_TOKEN_KEY", saved.key],
    ["GOOGLE_CLIENT_ID", saved.id],
    ["GOOGLE_CLIENT_SECRET", saved.secret],
  ] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  vi.restoreAllMocks();
});

describe("saveGoogleConnection", () => {
  it("writes ciphertext, never the token", async () => {
    const ok = await saveGoogleConnection({
      userId: USER,
      tokens: { accessToken: "ya29.access", refreshToken: "1//refresh", expiresAt: new Date(inAnHour()), scopes: [DRIVE] },
      accountEmail: "person@example.com",
    });
    expect(ok).toBe(true);
    const written = table.upserts[0];
    expect(String(written.access_token)).toMatch(/^enc:v1:/);
    expect(String(written.refresh_token)).toMatch(/^enc:v1:/);
    expect(JSON.stringify(written)).not.toContain("ya29.access");
    expect(JSON.stringify(written)).not.toContain("1//refresh");
    expect(openSecret(written.refresh_token as string, `google:refresh_token:${USER}`).value).toBe("1//refresh");
  });

  it("keeps the stored refresh token when Google does not issue a new one", async () => {
    table.row = {
      access_token: sealSecret("old-access", `google:access_token:${USER}`),
      refresh_token: sealSecret("1//kept", `google:refresh_token:${USER}`),
      expires_at: inAnHour(), scopes: [DRIVE], account_email: "person@example.com", connected_at: "2026-09-01T00:00:00Z",
    };
    await saveGoogleConnection({
      userId: USER,
      tokens: { accessToken: "ya29.new", refreshToken: null, expiresAt: new Date(inAnHour()), scopes: [DRIVE] },
      accountEmail: null,
    });
    expect(openSecret(table.upserts[0].refresh_token as string, `google:refresh_token:${USER}`).value).toBe("1//kept");
  });

  it("refuses to store anything without a key", async () => {
    delete process.env.INTEGRATION_TOKEN_KEY;
    const ok = await saveGoogleConnection({
      userId: USER,
      tokens: { accessToken: "ya29.access", refreshToken: "1//refresh", expiresAt: new Date(inAnHour()), scopes: [DRIVE] },
      accountEmail: null,
    });
    expect(ok).toBe(false);
    expect(table.upserts).toHaveLength(0);
  });
});

describe("googleAccessToken", () => {
  it("opens a sealed row", async () => {
    table.row = {
      access_token: sealSecret("ya29.sealed", `google:access_token:${USER}`),
      refresh_token: sealSecret("1//refresh", `google:refresh_token:${USER}`),
      expires_at: inAnHour(), scopes: [DRIVE], account_email: null, connected_at: null,
    };
    expect(await googleAccessToken(USER)).toBe("ya29.sealed");
    expect(table.updates).toHaveLength(0);
  });

  it("still honours a row written before sealing existed, and seals it on the way past", async () => {
    table.row = {
      access_token: "ya29.legacy", refresh_token: "1//legacy",
      expires_at: inAnHour(), scopes: [DRIVE], account_email: null, connected_at: null,
    };
    expect(await googleAccessToken(USER)).toBe("ya29.legacy");

    expect(table.updates).toHaveLength(1);
    const sealed = table.updates[0];
    expect(String(sealed.access_token)).toMatch(/^enc:v1:/);
    expect(String(sealed.refresh_token)).toMatch(/^enc:v1:/);
    expect(openSecret(sealed.refresh_token as string, `google:refresh_token:${USER}`).value).toBe("1//legacy");

    /* The next read finds ciphertext and leaves it alone. */
    expect(await googleAccessToken(USER)).toBe("ya29.legacy");
    expect(table.updates).toHaveLength(1);
  });

  it("treats a row sealed under another key as no connection at all", async () => {
    process.env.INTEGRATION_TOKEN_KEY = OTHER_KEY;
    table.row = {
      access_token: sealSecret("ya29.other", `google:access_token:${USER}`),
      refresh_token: sealSecret("1//other", `google:refresh_token:${USER}`),
      expires_at: inAnHour(), scopes: [DRIVE], account_email: "person@example.com", connected_at: null,
    };
    process.env.INTEGRATION_TOKEN_KEY = KEY;

    expect(await googleAccessToken(USER)).toBeNull();
    expect(await connectionStatus(USER)).toMatchObject({ connected: false, accountEmail: null });
  });

  it("is off entirely when the integration cannot store a grant safely", async () => {
    delete process.env.INTEGRATION_TOKEN_KEY;
    table.row = { access_token: "ya29.legacy", refresh_token: "1//legacy", expires_at: inAnHour(), scopes: [DRIVE], account_email: null, connected_at: null };
    expect(await googleAccessToken(USER)).toBeNull();
    expect(table.updates).toHaveLength(0);
  });
});

describe("connectionStatus and disconnectGoogle", () => {
  it("reports the account without ever returning a token", async () => {
    table.row = {
      access_token: sealSecret("ya29.sealed", `google:access_token:${USER}`),
      refresh_token: sealSecret("1//refresh", `google:refresh_token:${USER}`),
      expires_at: inAnHour(), scopes: [DRIVE], account_email: "person@example.com", connected_at: "2026-09-01T00:00:00Z",
    };
    const status = await connectionStatus(USER);
    expect(status).toEqual({ connected: true, accountEmail: "person@example.com", connectedAt: "2026-09-01T00:00:00Z", driveGranted: true });
    expect(JSON.stringify(status)).not.toContain("refresh");
  });

  it("removes the row on disconnect", async () => {
    table.row = { access_token: null, refresh_token: null, expires_at: null, scopes: [], account_email: null, connected_at: null };
    expect(await disconnectGoogle(USER)).toBe(true);
    expect(table.deletes).toBe(1);
    expect(await connectionStatus(USER)).toMatchObject({ connected: false });
  });
});
