#!/usr/bin/env node
/**
 * Push local .env values to Vercel Production (never commits secrets).
 * Usage: node scripts/sync-vercel-env.mjs
 * Requires: dotenv, vercel CLI logged in, .env filled locally.
 */
import { config } from "dotenv";
import { execSync } from "node:child_process";

config();

const KEYS = [
  "DATABASE_URL",
  "EXA_API_KEY",
  "FIRECRAWL_API_KEY",
  "APOLLO_API_KEY",
  "NVIDIA_API_KEY",
  "MODEL_BASE_URL",
  "MODEL_NAME",
  "HUBSPOT_ACCESS_TOKEN",
  "INNGEST_EVENT_KEY",
  "INNGEST_SIGNING_KEY",
  "NEXT_PUBLIC_APP_URL",
  "APP_ACCESS_PASSWORD",
  "AUTH_SECRET",
];

for (const key of KEYS) {
  const value = process.env[key];
  if (!value?.trim()) {
    console.warn(`skip ${key} (empty)`);
    continue;
  }
  execSync(`vercel env add ${key} production --force --sensitive`, { input: value, stdio: ["pipe", "inherit", "inherit"] });
  console.log(`ok ${key}`);
}
