import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import ws from "ws";
import * as schema from "@shared/schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

/**
 * Two backends behind one `db`:
 *  - postgres://…  Neon / any Postgres over the Neon serverless driver (production)
 *  - pglite://./data/dev   embedded Postgres (PGlite, WASM) for local development, demos and
 *    tests. No server to install; the directory is created on first use. `pglite://memory`
 *    keeps everything in memory.
 */
const databaseUrl: string = url;
export const isPglite = databaseUrl.startsWith("pglite:");

type Db = ReturnType<typeof drizzleNeon<typeof schema>>;

function connect(): { pool: Pool | null; db: Db } {
  if (isPglite) {
    const target = databaseUrl.replace(/^pglite:\/{0,2}/, "");
    const client = new PGlite(target && target !== "memory" ? target : undefined);
    return { pool: null, db: drizzlePglite({ client, schema }) as unknown as Db };
  }
  neonConfig.webSocketConstructor = ws;
  const pool = new Pool({ connectionString: databaseUrl });
  return { pool, db: drizzleNeon({ client: pool, schema }) };
}

const connection = connect();
export const pool = connection.pool;
export const db = connection.db;
