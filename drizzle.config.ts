import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

// pglite://./data/dev -> embedded PGlite database (local dev / demo); anything else is Postgres
const isPglite = url.startsWith("pglite:");

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  ...(isPglite
    ? { driver: "pglite" as const, dbCredentials: { url: url.replace(/^pglite:\/{0,2}/, "") || "memory://" } }
    : { dbCredentials: { url } }),
});
