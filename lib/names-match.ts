/** Best-effort company-name similarity (no server-only — safe for scripts and pure modules). */
export function namesMatch(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/\b(incorporated|inc|llc|ltd|limited|corp|corporation|co|company|gmbh|ag|sa|plc|holdings|group|the|usa|north america)\b/g, " ")
      .replace(/[^a-z0-9 ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  const containsWord = (hay: string, needle: string) => ` ${hay} `.includes(` ${needle} `);
  return (
    x === y ||
    (x.length >= 4 && containsWord(y, x)) ||
    (y.length >= 4 && containsWord(x, y)) ||
    // Short trade names: TVH ↔ TVH Parts, etc. (whole-word only)
    (x.length >= 2 && containsWord(y, x)) ||
    (y.length >= 2 && containsWord(x, y))
  );
}
