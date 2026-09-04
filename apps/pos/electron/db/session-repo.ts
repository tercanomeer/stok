import type { PosDatabase } from './database';
import type { PosPrincipal } from '../shared/ipc-contracts';

export interface StoredSession {
  user: PosPrincipal;
  passwordHash: string;
  /** safeStorage ile şifrelenmiş `{ accessToken, refreshToken }` — düz metin değil. */
  tokenBlob: Buffer | null;
  lastOnlineLoginAt: string;
}

interface SessionRow {
  userId: string;
  email: string;
  fullName: string;
  tenantId: string;
  permissions: string;
  roles: string;
  passwordHash: string;
  tokenBlob: Buffer | null;
  lastOnlineLoginAt: string;
}

function toStored(row: SessionRow): StoredSession {
  return {
    user: {
      id: row.userId,
      tenantId: row.tenantId,
      email: row.email,
      fullName: row.fullName,
      permissions: JSON.parse(row.permissions) as string[],
      roles: JSON.parse(row.roles) as string[],
    },
    passwordHash: row.passwordHash,
    tokenBlob: row.tokenBlob,
    lastOnlineLoginAt: row.lastOnlineLoginAt,
  };
}

const SELECT = `
  SELECT user_id AS userId, email, full_name AS fullName, tenant_id AS tenantId,
         permissions, roles, password_hash AS passwordHash, token_blob AS tokenBlob,
         last_online_login_at AS lastOnlineLoginAt
    FROM sessions`;

/** Başarılı ÇEVRİMİÇİ giriş sonrası oturumu önbelleğe alır (varsa günceller). */
export function saveSession(
  db: PosDatabase,
  input: {
    user: PosPrincipal;
    passwordHash: string;
    tokenBlob: Buffer | null;
    lastOnlineLoginAt: string;
  },
  now: Date,
): void {
  db.prepare(
    `INSERT INTO sessions
       (user_id, email, full_name, tenant_id, permissions, roles, password_hash, token_blob, last_online_login_at, updated_at)
     VALUES (@userId, @email, @fullName, @tenantId, @permissions, @roles, @passwordHash, @tokenBlob, @lastOnlineLoginAt, @updatedAt)
     ON CONFLICT(user_id) DO UPDATE SET
       email = excluded.email,
       full_name = excluded.full_name,
       tenant_id = excluded.tenant_id,
       permissions = excluded.permissions,
       roles = excluded.roles,
       password_hash = excluded.password_hash,
       token_blob = excluded.token_blob,
       last_online_login_at = excluded.last_online_login_at,
       updated_at = excluded.updated_at`,
  ).run({
    userId: input.user.id,
    email: input.user.email.toLowerCase(),
    fullName: input.user.fullName,
    tenantId: input.user.tenantId,
    permissions: JSON.stringify(input.user.permissions),
    roles: JSON.stringify(input.user.roles),
    passwordHash: input.passwordHash,
    tokenBlob: input.tokenBlob,
    lastOnlineLoginAt: input.lastOnlineLoginAt,
    updatedAt: now.toISOString(),
  });
}

export function findSessionByEmail(db: PosDatabase, email: string): StoredSession | null {
  const row = db.prepare(`${SELECT} WHERE email = ?`).get(email.toLowerCase()) as
    SessionRow | undefined;
  return row ? toStored(row) : null;
}

export function findSessionById(db: PosDatabase, userId: string): StoredSession | null {
  const row = db.prepare(`${SELECT} WHERE user_id = ?`).get(userId) as SessionRow | undefined;
  return row ? toStored(row) : null;
}

/** Token yenilendiğinde yalnız şifreli blob'u tazeler. */
export function updateTokenBlob(
  db: PosDatabase,
  userId: string,
  tokenBlob: Buffer | null,
  now: Date,
): void {
  db.prepare('UPDATE sessions SET token_blob = ?, updated_at = ? WHERE user_id = ?').run(
    tokenBlob,
    now.toISOString(),
    userId,
  );
}
