import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import ws from "ws";
import * as coreSchema from "@shared/schema";
import * as ledgerSchema from "@shared/ledger-schema";

const schema = { ...coreSchema, ...ledgerSchema };

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}
const databaseUrl: string = url;

/**
 * Three backends behind one `db`:
 *  - Neon (host ends in neon.tech, or DATABASE_DRIVER=neon): Neon's serverless driver over WebSocket
 *  - any other Postgres (Supabase, RDS, a container, ...): node-postgres. TLS is on unless the host
 *    is local; set DATABASE_SSL=verify to require a CA-verified certificate.
 *  - pglite://./data/dev: embedded Postgres (PGlite) for local development, demos and tests.
 *    `pglite://memory` keeps everything in memory.
 */
export const isPglite = databaseUrl.startsWith("pglite:");
export const driver: "neon" | "postgres" | "pglite" = isPglite
  ? "pglite"
  : process.env.DATABASE_DRIVER === "neon" || /neon\.tech/.test(databaseUrl) ? "neon" : "postgres";

type Db = ReturnType<typeof drizzleNeon<typeof schema>>;

function connect(): { pool: NeonPool | pg.Pool | null; db: Db } {
  if (driver === "pglite") {
    const target = databaseUrl.replace(/^pglite:\/{0,2}/, "");
    const client = new PGlite(target && target !== "memory" ? target : undefined);
    return { pool: null, db: drizzlePglite({ client, schema }) as unknown as Db };
  }
  if (driver === "neon") {
    neonConfig.webSocketConstructor = ws;
    const pool = new NeonPool({ connectionString: databaseUrl });
    return { pool, db: drizzleNeon({ client: pool, schema }) };
  }
  const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(databaseUrl);
  const ssl = local || process.env.DATABASE_SSL === "disable"
    ? undefined
    : { rejectUnauthorized: process.env.DATABASE_SSL === "verify" };
  const pool = new pg.Pool({ connectionString: databaseUrl, ssl, max: Number(process.env.DB_POOL_MAX || 10) });
  pool.on("error", err => console.error("Postgres pool error:", err.message));
  return { pool, db: drizzlePg({ client: pool, schema }) as unknown as Db };
}

const connection = connect();
export const pool = connection.pool;
export const db = connection.db;
