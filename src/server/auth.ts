import "server-only";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { cache } from "react";
import { nanoid } from "nanoid";
import { env } from "@/env";
import { prisma } from "./db";

const COOKIE = "kambio_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 14;
const secret = new TextEncoder().encode(env.AUTH_SECRET);

export type SessionUser = {
  userId: string;
  orgId: string;
  email: string;
  name: string;
  role: "OWNER" | "OPS" | "VIEWER";
  orgName: string;
};

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 10);
}
export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

async function sign(user: SessionUser) {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret);
}

export async function createSession(user: SessionUser) {
  const token = await sign(user);
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/** Current session, or null. Cached per request. */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    if (!payload.userId || !payload.orgId) return null;
    return {
      userId: String(payload.userId),
      orgId: String(payload.orgId),
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
      role: (payload.role as SessionUser["role"]) ?? "OPS",
      orgName: String(payload.orgName ?? ""),
    };
  } catch {
    return null;
  }
});

/** Session or throw — use in server actions / route handlers. */
export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHENTICATED");
  return session;
}

export async function signIn(email: string, password: string): Promise<SessionUser | null> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    include: { org: true },
  });
  if (!user) {
    // Constant-ish time: still run a hash so a missing user isn't faster.
    await bcrypt.compare(password, "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva");
    return null;
  }
  if (!(await verifyPassword(password, user.passwordHash))) return null;

  return {
    userId: user.id,
    orgId: user.orgId,
    email: user.email,
    name: user.name,
    role: user.role,
    orgName: user.org.name,
  };
}

export async function signUp(input: {
  orgName: string;
  name: string;
  email: string;
  password: string;
}): Promise<SessionUser> {
  const email = input.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error("An account with that email already exists");

  const slugBase = input.orgName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "org";

  const org = await prisma.org.create({
    data: {
      name: input.orgName,
      slug: `${slugBase}-${nanoid(6).toLowerCase()}`,
      inboundKey: nanoid(10).toLowerCase(),
    },
  });

  const user = await prisma.user.create({
    data: {
      orgId: org.id,
      email,
      name: input.name,
      passwordHash: await hashPassword(input.password),
      role: "OWNER",
    },
  });

  return {
    userId: user.id,
    orgId: org.id,
    email: user.email,
    name: user.name,
    role: user.role,
    orgName: org.name,
  };
}
