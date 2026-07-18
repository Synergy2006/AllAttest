// ============================================================
// Auth
// ------------------------------------------------------------
// Email + password logins with two roles:
//   operator — platform operator (Admin Console, all tenants)
//   tenant   — belongs to exactly one tenant workspace
// Passwords are scrypt-hashed (node:crypto, no extra deps).
// Sessions are opaque bearer tokens persisted in the JSON store
// so they survive API restarts; they expire after 24 hours.
// Replaces the old ADMIN_KEY guard (roadmap item 5).
// ============================================================

import crypto from "crypto";
import { db } from "./store.js";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// ---- passwords ----
export function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, user) {
  const candidate = crypto.scryptSync(password, user.salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(user.passwordHash, "hex"));
}

export function generatePassword() {
  return crypto.randomBytes(9).toString("base64url"); // ~12 chars
}

// ---- users ----
const publicUser = (u) => u && { id: u.id, email: u.email, name: u.name, role: u.role, tenantId: u.tenantId, createdAt: u.createdAt };

export function findUserByEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  return db.get("users").find((u) => u.email === e) ?? null;
}

export function listUsers() {
  return db.get("users").map(publicUser);
}

export function createUser({ email, name, password, role, tenantId }) {
  const e = String(email || "").trim().toLowerCase();
  if (!e || !e.includes("@")) throw new Error("A valid email is required");
  if (!["operator", "tenant"].includes(role)) throw new Error(`Invalid role: ${role}`);
  if (role === "tenant" && !tenantId) throw new Error("Tenant users need a tenantId");
  if (findUserByEmail(e)) throw new Error(`A login already exists for ${e}`);
  const pw = password || generatePassword();
  const { salt, hash } = hashPassword(pw);
  const user = db.insert("users", {
    id: `u_${crypto.randomBytes(8).toString("hex")}`,
    email: e,
    name: (name || e.split("@")[0]).trim(),
    role,
    tenantId: role === "tenant" ? tenantId : null,
    salt,
    passwordHash: hash,
    createdAt: new Date().toISOString(),
  });
  // The plaintext is returned ONCE (for the operator to hand off) and never stored.
  return { user: publicUser(user), password: pw };
}

export function resetPassword(userId) {
  const user = db.find("users", userId);
  if (!user) throw new Error("Unknown user");
  const pw = generatePassword();
  const { salt, hash } = hashPassword(pw);
  db.update("users", userId, { salt, passwordHash: hash });
  return { user: publicUser(user), password: pw };
}

export function deleteUser(userId, actingUserId) {
  const user = db.find("users", userId);
  if (!user) throw new Error("Unknown user");
  if (user.id === actingUserId) throw new Error("You can't delete your own login");
  const operators = db.get("users").filter((u) => u.role === "operator");
  if (user.role === "operator" && operators.length <= 1) throw new Error("Can't delete the last operator login");
  // Revoke any live sessions for the deleted user.
  for (const s of db.get("sessions").filter((s) => s.userId === userId)) db.remove("sessions", s.id);
  db.remove("users", userId);
  return true;
}

// ---- sessions ----
export function login(email, password) {
  const user = findUserByEmail(email);
  if (!user || !verifyPassword(String(password || ""), user)) {
    throw new Error("Invalid email or password");
  }
  const now = Date.now();
  const session = db.insert("sessions", {
    id: crypto.randomBytes(24).toString("base64url"),
    userId: user.id,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
  });
  return { token: session.id, user: publicUser(user) };
}

export function getSession(token) {
  if (!token) return null;
  const session = db.find("sessions", token);
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    db.remove("sessions", token);
    return null;
  }
  const user = db.find("users", session.userId);
  if (!user) {
    db.remove("sessions", token);
    return null;
  }
  return { session, user: publicUser(user) };
}

export function logout(token) {
  return db.remove("sessions", token);
}
