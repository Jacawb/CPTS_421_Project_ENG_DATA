// functions/api/[[path]].ts  -> handles every request under /api/*
// Bindings required (Pages project -> Settings -> Bindings): DB (D1)
// Optional secret (Settings -> Variables and Secrets): SETUP_TOKEN
//   While no accounts exist, the first visitor can create the first admin account (POST /api/auth/setup).
//   If SETUP_TOKEN is set, that visitor must also enter it. Once any account exists, setup is
//   refused no matter what.
//
// Every route except /api/auth/status, /api/auth/login and /api/auth/setup requires a
// signed-in session. Roles:
//   user  -> read documents, Keyword in Context, Annotate, Data Visualization
//   admin -> everything above, plus Document Manager (upload/delete/move files, corpora)
//            and account management (/api/users, /api/audit)

interface Env {
  DB: D1Database;
  SETUP_TOKEN?: string;
}

type Role = "admin" | "user";

interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: Role;
  mustChangePassword: boolean;
}

const MAX_FILE_BYTES = 1_000_000; // D1 caps a single value at ~2 MB

// ---------- auth settings ----------
const SESSION_COOKIE = "__Host-session";       // __Host- = Secure, Path=/, no Domain (can't be set by subdomains)
const SESSION_IDLE_MS = 60 * 60 * 1000;         // signed out after 1 hour without activity
const SESSION_MAX_MS = 12 * 60 * 60 * 1000;     // and after 12 hours no matter what
const PBKDF2_ITERATIONS = 100_000;              // Cloudflare Workers' maximum for PBKDF2
const MAX_FAILED_LOGINS = 5;                    // then the account is locked for LOCKOUT_MS
const LOCKOUT_MS = 15 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 256;
const ROLES: Role[] = ["admin", "user"];

const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
const err = (message: string, status = 400, extra: Record<string, unknown> = {}) =>
  json({ error: message, ...extra }, status);

const readJson = async <T>(request: Request): Promise<T> => {
  try { return (await request.json()) as T; } catch { return {} as T; }
};

// ---------- crypto helpers ----------
const enc = new TextEncoder();
const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
const fromHex = (hex: string) => new Uint8Array((hex.match(/../g) ?? []).map(h => parseInt(h, 16)));
const randomHex = (bytes: number) => toHex(crypto.getRandomValues(new Uint8Array(bytes)).buffer);
const sha256Hex = async (s: string) => toHex(await crypto.subtle.digest("SHA-256", enc.encode(s)));

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function pbkdf2(password: string, saltHex: string, iterations: number) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: fromHex(saltHex), iterations }, key, 256
  );
  return toHex(bits);
}

// Stored as "pbkdf2_sha256$<iterations>$<salt hex>$<hash hex>" so the cost can be raised later.
async function hashPassword(password: string) {
  const salt = randomHex(16);
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${salt}$${await pbkdf2(password, salt, PBKDF2_ITERATIONS)}`;
}

async function verifyPassword(password: string, stored: string) {
  const [scheme, iter, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2_sha256" || !salt || !hash) return false;
  return safeEqual(await pbkdf2(password, salt, Number(iter)), hash);
}

// Used when the email doesn't exist, so a wrong email takes as long as a wrong password.
const DUMMY_HASH = `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${"0".repeat(32)}$${"0".repeat(64)}`;

// ---------- validation ----------
const normEmail = (v: unknown) => String(v ?? "").trim().toLowerCase();
const isEmail = (v: string) => v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
function passwordProblem(p: unknown): string | null {
  if (typeof p !== "string" || p.length < MIN_PASSWORD_LENGTH)
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  if (p.length > MAX_PASSWORD_LENGTH) return "Password is too long";
  return null;
}

// ---------- sessions ----------
function getCookie(request: Request, name: string) {
  for (const part of (request.headers.get("Cookie") ?? "").split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return part.slice(i + 1);
  }
  return null;
}

const sessionCookie = (token: string, maxAgeSeconds: number) =>
  `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSeconds}`;

// Only a SHA-256 of the token is stored, so a leaked database can't be used to hijack sessions.
async function createSession(env: Env, userId: number) {
  const token = randomHex(32);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ? OR last_seen_at < ?").bind(now, now - SESSION_IDLE_MS),
    env.DB.prepare("INSERT INTO sessions (id, user_id, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?)")
      .bind(await sha256Hex(token), userId, now, now, now + SESSION_MAX_MS),
  ]);
  return token;
}

async function getSession(request: Request, env: Env): Promise<{ sessionId: string; user: SessionUser } | null> {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const sessionId = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT s.last_seen_at, s.expires_at, u.id, u.email, u.name, u.role, u.must_change_password, u.disabled
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`
  ).bind(sessionId).first<{
    last_seen_at: number; expires_at: number; id: number; email: string; name: string;
    role: Role; must_change_password: number; disabled: number;
  }>();
  if (!row) return null;
  const now = Date.now();
  if (row.disabled || now > row.expires_at || now - row.last_seen_at > SESSION_IDLE_MS) {
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
    return null;
  }
  if (now - row.last_seen_at > 60_000) { // refresh the idle timer at most once a minute
    await env.DB.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").bind(now, sessionId).run();
  }
  return {
    sessionId,
    user: { id: row.id, email: row.email, name: row.name, role: row.role, mustChangePassword: !!row.must_change_password },
  };
}

// Never put document text in `detail`; ids, file names and emails only.
const audit = (env: Env, userId: number | null, action: string, detail = "") =>
  env.DB.prepare("INSERT INTO audit_log (user_id, action, detail) VALUES (?, ?, ?)").bind(userId, action, detail);

const publicUser = (u: SessionUser) => ({
  id: u.id, email: u.email, name: u.name, role: u.role, mustChangePassword: u.mustChangePassword,
});

// Routes only admins may call.
function isAdminRoute(parts: string[], method: string) {
  if (parts[0] === "users" || parts[0] === "audit") return true;
  if (parts[0] === "corpora" && method !== "GET") return true;
  // POST/PATCH/DELETE on /files and /files/:id. Adding annotations (/files/:id/annotations) is for everyone.
  if (parts[0] === "files" && method !== "GET" && parts.length <= 2) return true;
  return false;
}

export const onRequest = async ({ request, env }: { request: Request; env: Env }) => {
  const url = new URL(request.url);
  const method = request.method;
  const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  // parts examples: ["files"], ["files","3"], ["files","3","annotations"], ["groups","2"], ["annotations","9"]

  try {
    // Block cross-site requests that change data (backs up SameSite=Strict on the cookie).
    if (method !== "GET" && method !== "HEAD") {
      const origin = request.headers.get("Origin");
      if (origin && origin !== url.origin) return err("Cross-origin request refused", 403);
    }

    // ---------- AUTH (public) ----------
    if (parts[0] === "auth") {
      // GET /api/auth/status -> { needsSetup, setupTokenRequired } (needsSetup is true only while no accounts exist)
      if (parts[1] === "status" && method === "GET") {
        const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first<{ n: number }>();
        const needsSetup = (row?.n ?? 0) === 0;
        return json({ needsSetup, setupTokenRequired: needsSetup && !!env.SETUP_TOKEN });
      }

      // POST /api/auth/setup  body: { email, name, password, setupToken? }  -> creates the first admin
      if (parts[1] === "setup" && method === "POST") {
        const b = await readJson<{ email?: string; name?: string; password?: string; setupToken?: string }>(request);
        if (env.SETUP_TOKEN && !safeEqual(String(b.setupToken ?? ""), env.SETUP_TOKEN))
          return err("Setup token is incorrect", 403);
        const email = normEmail(b.email);
        const name = String(b.name ?? "").trim();
        if (!isEmail(email)) return err("Enter a valid email address");
        if (!name) return err("Name required");
        const problem = passwordProblem(b.password);
        if (problem) return err(problem);
        const row = await env.DB.prepare(
          `INSERT INTO users (email, name, role, password_hash, must_change_password)
           SELECT ?, ?, 'admin', ?, 0 WHERE NOT EXISTS (SELECT 1 FROM users) RETURNING id`
        ).bind(email, name, await hashPassword(b.password!)).first<{ id: number }>();
        if (!row) return err("Setup has already been completed", 409);
        await audit(env, row.id, "setup", email).run();
        const token = await createSession(env, row.id);
        return json({ user: { id: row.id, email, name, role: "admin", mustChangePassword: false } }, 201,
          { "Set-Cookie": sessionCookie(token, SESSION_MAX_MS / 1000) });
      }

      // POST /api/auth/login  body: { email, password }
      if (parts[1] === "login" && method === "POST") {
        const b = await readJson<{ email?: string; password?: string }>(request);
        const email = normEmail(b.email);
        const password = String(b.password ?? "");
        const user = await env.DB.prepare(
          `SELECT id, email, name, role, password_hash, must_change_password, disabled, failed_attempts, locked_until
           FROM users WHERE email = ?`
        ).bind(email).first<{
          id: number; email: string; name: string; role: Role; password_hash: string;
          must_change_password: number; disabled: number; failed_attempts: number; locked_until: number | null;
        }>();
        const bad = () => err("Incorrect email or password", 401);
        if (!user) { await verifyPassword(password, DUMMY_HASH); return bad(); }

        const now = Date.now();
        if (user.locked_until && user.locked_until > now) {
          return err("Too many failed attempts. Try again in 15 minutes.", 429);
        }
        const ok = await verifyPassword(password, user.password_hash);
        if (!ok) {
          const fails = user.failed_attempts + 1;
          const lockedUntil = fails >= MAX_FAILED_LOGINS ? now + LOCKOUT_MS : null;
          await env.DB.batch([
            env.DB.prepare("UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?")
              .bind(lockedUntil ? 0 : fails, lockedUntil, user.id),
            audit(env, user.id, lockedUntil ? "login_locked" : "login_failed", email),
          ]);
          return bad();
        }
        if (user.disabled) return bad(); // same message: don't reveal which accounts exist or are disabled

        await env.DB.batch([
          env.DB.prepare("UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(user.id),
          audit(env, user.id, "login", email),
        ]);
        const token = await createSession(env, user.id);
        return json(
          { user: { id: user.id, email: user.email, name: user.name, role: user.role, mustChangePassword: !!user.must_change_password } },
          200, { "Set-Cookie": sessionCookie(token, SESSION_MAX_MS / 1000) }
        );
      }
    }

    // ---------- everything below requires a session ----------
    const session = await getSession(request, env);
    if (!session) return err("Not signed in", 401, { code: "UNAUTHENTICATED" });
    const me = session.user;

    if (parts[0] === "auth") {
      // GET /api/auth/me
      if (parts[1] === "me" && method === "GET") return json({ user: publicUser(me) });

      // POST /api/auth/logout
      if (parts[1] === "logout" && method === "POST") {
        await env.DB.batch([
          env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(session.sessionId),
          audit(env, me.id, "logout"),
        ]);
        return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
      }

      // POST /api/auth/password  body: { currentPassword, newPassword }
      // currentPassword isn't needed while the account is on an admin-issued temporary password:
      // the user just signed in with it. Signs out every other session for this account.
      if (parts[1] === "password" && method === "POST") {
        const b = await readJson<{ currentPassword?: string; newPassword?: string }>(request);
        const row = await env.DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(me.id)
          .first<{ password_hash: string }>();
        if (!row) return err("Not found", 404);
        if (!me.mustChangePassword && !(await verifyPassword(String(b.currentPassword ?? ""), row.password_hash)))
          return err("Current password is incorrect", 403);
        const problem = passwordProblem(b.newPassword);
        if (problem) return err(problem);
        if (await verifyPassword(b.newPassword!, row.password_hash))
          return err("New password must be different from the current one");
        await env.DB.batch([
          env.DB.prepare("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?")
            .bind(await hashPassword(b.newPassword!), me.id),
          env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND id <> ?").bind(me.id, session.sessionId),
          audit(env, me.id, "password_changed"),
        ]);
        return json({ user: { ...publicUser(me), mustChangePassword: false } });
      }
      return err("Not found", 404);
    }

    // An account with a temporary password can't do anything else until it's changed.
    if (me.mustChangePassword) return err("You must change your password first", 403, { code: "PASSWORD_CHANGE_REQUIRED" });
    if (isAdminRoute(parts, method) && me.role !== "admin") return err("Admins only", 403, { code: "FORBIDDEN" });

    // ---------- USERS (admin) ----------
    if (parts[0] === "users") {
      // GET /api/users
      if (parts.length === 1 && method === "GET") {
        const { results } = await env.DB.prepare(
          `SELECT id, email, name, role, disabled, must_change_password, created_at, last_login_at,
                  (locked_until IS NOT NULL AND locked_until > ?) AS locked
           FROM users ORDER BY role, name COLLATE NOCASE`
        ).bind(Date.now()).all();
        return json(results);
      }

      // POST /api/users  body: { email, name, role, password }  (password is temporary; changed at first sign-in)
      if (parts.length === 1 && method === "POST") {
        const b = await readJson<{ email?: string; name?: string; role?: Role; password?: string }>(request);
        const email = normEmail(b.email);
        const name = String(b.name ?? "").trim().slice(0, 100);
        const role = b.role ?? "user";
        if (!isEmail(email)) return err("Enter a valid email address");
        if (!name) return err("Name required");
        if (!ROLES.includes(role)) return err("Role must be admin or user");
        const problem = passwordProblem(b.password);
        if (problem) return err(problem);
        const row = await env.DB.prepare(
          `INSERT INTO users (email, name, role, password_hash, must_change_password) VALUES (?, ?, ?, ?, 1)
           ON CONFLICT(email) DO NOTHING RETURNING id, email, name, role, disabled, must_change_password, created_at, last_login_at`
        ).bind(email, name, role, await hashPassword(b.password!)).first();
        if (!row) return err("An account with that email already exists", 409);
        await audit(env, me.id, "user_created", `${email} (${role})`).run();
        return json({ ...row, locked: 0 }, 201);
      }

      const userId = Number(parts[1]);
      if (!Number.isInteger(userId)) return err("Bad user id");
      const target = await env.DB.prepare("SELECT id, email FROM users WHERE id = ?").bind(userId)
        .first<{ id: number; email: string }>();
      if (!target) return err("Not found", 404);
      const isSelf = userId === me.id;

      // PATCH /api/users/:id  body: { name?, role?, disabled?, unlock? }
      if (parts.length === 2 && method === "PATCH") {
        const b = await readJson<{ name?: string; role?: Role; disabled?: boolean; unlock?: boolean }>(request);
        const sets: string[] = [];
        const binds: unknown[] = [];
        const changes: string[] = [];
        if (b.name !== undefined) {
          const name = String(b.name).trim().slice(0, 100);
          if (!name) return err("Name required");
          sets.push("name = ?"); binds.push(name); changes.push("name");
        }
        if (b.role !== undefined) {
          if (!ROLES.includes(b.role)) return err("Role must be admin or user");
          if (isSelf && b.role !== "admin") return err("You can't remove your own admin role");
          sets.push("role = ?"); binds.push(b.role); changes.push(`role=${b.role}`);
        }
        if (b.disabled !== undefined) {
          if (isSelf && b.disabled) return err("You can't disable your own account");
          sets.push("disabled = ?"); binds.push(b.disabled ? 1 : 0); changes.push(b.disabled ? "disabled" : "enabled");
        }
        if (b.unlock) { sets.push("failed_attempts = 0, locked_until = NULL"); changes.push("unlocked"); }
        if (sets.length === 0) return err("Nothing to change");
        const statements = [
          env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).bind(...binds, userId),
          audit(env, me.id, "user_updated", `${target.email}: ${changes.join(", ")}`),
        ];
        // Disabling or changing the role takes effect immediately: sign the account out everywhere.
        if (b.disabled || b.role !== undefined) {
          statements.push(env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId));
        }
        await env.DB.batch(statements);
        const row = await env.DB.prepare(
          `SELECT id, email, name, role, disabled, must_change_password, created_at, last_login_at,
                  (locked_until IS NOT NULL AND locked_until > ?) AS locked FROM users WHERE id = ?`
        ).bind(Date.now(), userId).first();
        return json(row);
      }

      // POST /api/users/:id/password  body: { password }  -> new temporary password, signs them out
      if (parts.length === 3 && parts[2] === "password" && method === "POST") {
        if (isSelf) return err("Use Change password to change your own password");
        const { password } = await readJson<{ password?: string }>(request);
        const problem = passwordProblem(password);
        if (problem) return err(problem);
        await env.DB.batch([
          env.DB.prepare(
            "UPDATE users SET password_hash = ?, must_change_password = 1, failed_attempts = 0, locked_until = NULL WHERE id = ?"
          ).bind(await hashPassword(password!), userId),
          env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId),
          audit(env, me.id, "password_reset", target.email),
        ]);
        return json({ ok: true });
      }

      // DELETE /api/users/:id  (their annotations stay, with no author)
      if (parts.length === 2 && method === "DELETE") {
        if (isSelf) return err("You can't delete your own account");
        await env.DB.batch([
          env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId), // cascades to sessions
          audit(env, me.id, "user_deleted", target.email),
        ]);
        return json({ deleted: true });
      }
      return err("Not found", 404);
    }

    // ---------- AUDIT LOG (admin) ----------
    // GET /api/audit?limit=100
    if (parts[0] === "audit" && parts.length === 1 && method === "GET") {
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 100, 1), 500);
      const { results } = await env.DB.prepare(
        `SELECT a.id, a.action, a.detail, a.created_at, u.email AS user_email, u.name AS user_name
         FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
         ORDER BY a.id DESC LIMIT ?`
      ).bind(limit).all();
      return json(results);
    }

    // ---------- FILES ----------
    if (parts[0] === "files") {
      // GET /api/files              -> metadata only
      // GET /api/files?content=1    -> metadata + text (used to load the workspace in one request)
      if (parts.length === 1 && method === "GET") {
        const columns = url.searchParams.get("content") === "1"
          ? "id, name, content, size_bytes, corpus_id, created_at"
          : "id, name, size_bytes, corpus_id, created_at";
        const { results } = await env.DB.prepare(
          `SELECT ${columns} FROM files ORDER BY created_at DESC, id DESC`
        ).all();
        return json(results);
      }

      // POST /api/files   body: { name, content }   (JSON, so file names stay out of URLs/logs)
      if (parts.length === 1 && method === "POST") {
        const b = (await request.json()) as { name?: string; content?: string ; corpusId?: number | null };
        const name = (b.name ?? "").trim() || "untitled.txt";
        const content = b.content ?? "";
        const sizeBytes = new TextEncoder().encode(content).byteLength;
        const corpusId = Number.isInteger(b.corpusId) ? (b.corpusId as number) : null;
        if (sizeBytes === 0) return err("Empty file");
        if (sizeBytes > MAX_FILE_BYTES) return err("File too large (max 1 MB of text)", 413);

        const row = await env.DB
          .prepare("INSERT INTO files (name, content, size_bytes, corpus_id) VALUES (?, ?, ?, ?) RETURNING id, created_at")
          .bind(name, content, sizeBytes, corpusId)
          .first<{ id: number; created_at: string }>();
        await audit(env, me.id, "file_uploaded", `#${row!.id} ${name}`).run();
        return json({ id: row!.id, name, size_bytes: sizeBytes, corpus_id: corpusId, created_at: row!.created_at }, 201);
      }

      const fileId = Number(parts[1]);
      if (!Number.isInteger(fileId)) return err("Bad file id");

      // GET /api/files/:id  -> file + content + annotations
      if (parts.length === 2 && method === "GET") {
        const [fileRes, annRes] = await env.DB.batch([
          env.DB.prepare("SELECT id, name, content FROM files WHERE id = ?").bind(fileId),
          env.DB
            .prepare(
              `SELECT a.id, a.group_id, a.start_offset AS start, a.end_offset AS end,
                      a.selected_text, g.name, g.color, u.name AS created_by_name
               FROM annotations a JOIN annotation_groups g ON g.id = a.group_id
               LEFT JOIN users u ON u.id = a.created_by
               WHERE a.file_id = ? ORDER BY a.start_offset`
            )
            .bind(fileId),
        ]);
        const file = fileRes.results[0] as { id: number; name: string; content: string } | undefined;
        if (!file) return err("Not found", 404);
        return json({ id: file.id, name: file.name, content: file.content, annotations: annRes.results });
      }

      // DELETE /api/files/:id
      if (parts.length === 2 && method === "DELETE") {
        const [del] = await env.DB.batch([
          env.DB.prepare("DELETE FROM files WHERE id = ? RETURNING id, name").bind(fileId), // cascades to annotations
          env.DB.prepare(
            "DELETE FROM annotation_groups WHERE id NOT IN (SELECT DISTINCT group_id FROM annotations)"
          ),
        ]);
        if (del.results.length === 0) return err("Not found", 404);
        const deleted = del.results[0] as { name: string };
        await audit(env, me.id, "file_deleted", `#${fileId} ${deleted.name}`).run();
        return json({ deleted: true });
      }

      // PATCH /api/files/:id   body: { corpusId }  (null = unassigned)
      if (parts.length === 2 && method === "PATCH") {
        const { corpusId } = (await request.json()) as { corpusId?: number | null };
        const value = corpusId == null ? null : Number(corpusId);
        if (value !== null && !Number.isInteger(value)) return err("Bad corpus id");
        const row = await env.DB.prepare("UPDATE files SET corpus_id = ? WHERE id = ? RETURNING id")
          .bind(value, fileId).first();
        if (!row) return err("Not found", 404);
        return json({ id: fileId, corpus_id: value });
      }


      // POST /api/files/:id/annotations
      // body: { name, color, start, end, selectedText }
      // start/end both null = a whole-document annotation.
      // Finds the group by name (case-insensitive) or creates it with the given color.
      if (parts.length === 3 && parts[2] === "annotations" && method === "POST") {
        const b = (await request.json()) as {
          name?: string; color?: string; start?: number | null; end?: number | null; selectedText?: string;
        };
        const name = (b.name ?? "").trim();
        if (!name) return err("Tag name required");
        const wholeDocument = b.start == null && b.end == null;
        if (!wholeDocument &&
            (!Number.isInteger(b.start) || !Number.isInteger(b.end) || b.start! < 0 || b.end! <= b.start!))
          return err("Invalid range");

        const [, ins] = await env.DB.batch([
          env.DB
            .prepare("INSERT INTO annotation_groups (name, color) VALUES (?, ?) ON CONFLICT(name) DO NOTHING")
            .bind(name, b.color ?? "default"),
          env.DB
            .prepare(
              `INSERT INTO annotations (file_id, group_id, start_offset, end_offset, selected_text, created_by)
               SELECT ?, id, ?, ?, ?, ? FROM annotation_groups WHERE name = ?
               RETURNING id, group_id`
            )
            .bind(fileId, b.start ?? null, b.end ?? null, b.selectedText ?? "", me.id, name),
        ]);
        const row = ins.results[0] as { id: number; group_id: number } | undefined;
        if (!row) return err("Could not create annotation", 500);
        const group = await env.DB.prepare("SELECT name, color FROM annotation_groups WHERE id = ?")
          .bind(row.group_id)
          .first<{ name: string; color: string }>();
        return json({ id: row.id, group_id: row.group_id, ...group, created_by_name: me.name }, 201);
      }
    }

    // ---------- GROUPS ----------
    if (parts[0] === "groups") {
      // GET /api/groups  (with tag counts)
      if (parts.length === 1 && method === "GET") {
        const { results } = await env.DB.prepare(
          `SELECT g.id, g.name, g.color, COUNT(a.id) AS tag_count
           FROM annotation_groups g LEFT JOIN annotations a ON a.group_id = g.id
           GROUP BY g.id ORDER BY g.name`
        ).all();
        return json(results);
      }
      // PATCH /api/groups/:id   body: { color }   (recolors every tag in the group)
      const groupId = Number(parts[1]);
      if (parts.length === 2 && method === "PATCH" && Number.isInteger(groupId)) {
        const { color } = (await request.json()) as { color?: string };
        if (!color) return err("Color required");
        await env.DB.prepare("UPDATE annotation_groups SET color = ? WHERE id = ?").bind(color, groupId).run();
        return json({ id: groupId, color });
      }

      if (parts.length === 2 && method === "DELETE" && Number.isInteger(groupId)) {
        await env.DB.batch([
          env.DB.prepare("DELETE FROM annotations WHERE group_id = ?").bind(groupId),
          env.DB.prepare("DELETE FROM annotation_groups WHERE id = ?").bind(groupId),
        ]);
        return json({ deleted: true });
      }
    }

    // ---------- CORPORA ----------
    if (parts[0] === "corpora") {
      if (parts.length === 1 && method === "GET") {
        const { results } = await env.DB.prepare("SELECT id, name FROM corpora ORDER BY name").all();
        return json(results);
      }
      if (parts.length === 1 && method === "POST") {
        const { name } = (await request.json()) as { name?: string };
        const n = (name ?? "").trim();
        if (!n) return err("Name required");
        const row = await env.DB
          .prepare("INSERT INTO corpora (name) VALUES (?) ON CONFLICT(name) DO NOTHING RETURNING id, name")
          .bind(n).first();
        if (!row) return err("A corpus with that name already exists", 409);
        return json(row, 201);
      }
      const corpusId = Number(parts[1]);
      if (!Number.isInteger(corpusId)) return err("Bad corpus id");
      if (parts.length === 2 && method === "PATCH") {
        const { name } = (await request.json()) as { name?: string };
        const n = (name ?? "").trim();
        if (!n) return err("Name required");
        const row = await env.DB.prepare("UPDATE corpora SET name = ? WHERE id = ? RETURNING id, name")
          .bind(n, corpusId).first();
        if (!row) return err("Not found", 404);
        return json(row);
      }
      if (parts.length === 2 && method === "DELETE") {
        await env.DB.prepare("DELETE FROM corpora WHERE id = ?").bind(corpusId).run(); // files become unassigned
        return json({ deleted: true });
      }
    }

    // ---------- ANNOTATIONS ----------
    // GET /api/annotations?files=1,2,3  -> every annotation in those files, with its group
    if (parts[0] === "annotations" && parts.length === 1 && method === "GET") {
      const ids = (url.searchParams.get("files") ?? "").split(",").map(Number).filter(Number.isInteger);
      if (ids.length === 0) return json([]);
      const { results } = await env.DB
        .prepare(
          `SELECT a.id, a.file_id, a.group_id, a.start_offset AS start, a.end_offset AS end,
                  a.selected_text, g.name, g.color, u.name AS created_by_name
           FROM annotations a JOIN annotation_groups g ON g.id = a.group_id
           LEFT JOIN users u ON u.id = a.created_by
           WHERE a.file_id IN (SELECT value FROM json_each(?))
           ORDER BY a.id`
        )
        .bind(JSON.stringify(ids))
        .all();
      return json(results);
    }

    // DELETE /api/annotations/:id
    if (parts[0] === "annotations" && parts.length === 2 && method === "DELETE") {
      const id = Number(parts[1]);
      if (!Number.isInteger(id)) return err("Bad id");
      await env.DB.prepare("DELETE FROM annotations WHERE id = ?").bind(id).run();
      return json({ deleted: true });
    }

    return err("Not found", 404);
  } catch (e) {
    // Don't echo internal error text (it can include SQL); log it for `wrangler pages deployment tail`.
    console.error(e);
    return err("Server error", 500);
  }
};
