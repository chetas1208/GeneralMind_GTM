/**
 * Find verified public-profile contact routes for leads that have no email and no profile yet.
 * Goes through the deployed API (reviewer session), so it needs no database access.
 *
 *   BASE_URL=https://your-app.vercel.app APP_ACCESS_PASSWORD=... node scripts/backfill-contact-routes.mjs
 *   (BASE_URL defaults to http://localhost:3000; the password is optional in open dev mode)
 */
const base = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const password = process.env.APP_ACCESS_PASSWORD;

let cookie = "";
if (password) {
  const res = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
  if (!res.ok) throw new Error(`Login failed (${res.status})`);
  cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
}
const headers = cookie ? { cookie } : {};

const { items } = await (await fetch(`${base}/api/leads?limit=200`, { headers })).json();
const todo = items.filter((l) => !l.person.linkedinUrl && !l.person.email);
console.log(`${todo.length} leads without a contact route`);

let found = 0;
for (const l of todo) {
  const res = await fetch(`${base}/api/leads/${l.id}/contact-route`, { method: "POST", headers });
  const body = await res.json().catch(() => ({}));
  if (body.status === "found") found++;
  console.log(`${body.status ?? res.status}`.padEnd(10), l.person.fullName, "@", l.company?.name ?? "?", body.reasons?.length ? `(${body.reasons.join("; ")})` : "");
}
console.log(`Found ${found} of ${todo.length}.`);
