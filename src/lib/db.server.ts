import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __comicPrisma: PrismaClient | undefined;
}

/**
 * Lazily-created Prisma client.
 * Env vars are only guaranteed to exist at call time, so never build this at module scope.
 */
export function getDb(): PrismaClient {
  if (globalThis.__comicPrisma) {
    console.log("📦 Returning cached Prisma client");
    return globalThis.__comicPrisma;
  }

  const configured = process.env["DATABASE_URL"];
  const managed = process.env["SUPABASE_DB_URL"];
  // A localhost URL only works on a developer machine — the hosted app cannot
  // reach it, so fall back to the managed cloud database when one is available.
  const isLocal = !!configured && /@(localhost|127\.0\.0\.1)\b/.test(configured);
  const connectionString = (isLocal ? managed : configured) ?? managed;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Point it at your PostgreSQL database.");
  }

  console.log("🔌 Creating new Prisma client with DATABASE_URL:", connectionString.split("@")[1] || "***");
  // Managed cloud Postgres terminates TLS with its own certificate chain.
  const needsRelaxedTls = !!managed && connectionString === managed;
  const client = new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      ...(needsRelaxedTls ? { ssl: { rejectUnauthorized: false } } : {}),
    }),
  });
  globalThis.__comicPrisma = client;
  console.log("✅ Prisma client initialized");
  return client;
}
