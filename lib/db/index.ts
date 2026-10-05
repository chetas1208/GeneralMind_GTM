import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { requireEnv } from "@/lib/env";
import * as schema from "./schema";

type Db = ReturnType<typeof createDb>;

function createDb() {
  const sql = neon(requireEnv("DATABASE_URL"));
  return drizzle(sql, { schema });
}

let instance: Db | undefined;

/** Lazily constructed so `next build` does not require DATABASE_URL. */
export function getDb(): Db {
  instance ??= createDb();
  return instance;
}

export { schema };
