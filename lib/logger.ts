import "server-only";

type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const SECRET_KEY_PATTERN = /(key|token|secret|password|authorization|database_url)/i;
const SECRET_VALUE_PATTERN = /(nvapi-[\w-]+|fc-[a-f0-9]{16,}|npg_[\w]+|pat-[\w-]+)/g;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[depth]";
  if (typeof value === "string") return value.replace(SECRET_VALUE_PATTERN, "[redacted]");
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: redact(value.message) };
  if (value && typeof value === "object") {
    const out: Fields = {};
    for (const [k, v] of Object.entries(value as Fields)) {
      out[k] = SECRET_KEY_PATTERN.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function emit(level: Level, scope: string, message: string, fields?: Fields) {
  if (level === "debug" && process.env.NODE_ENV === "production") return;
  const line = JSON.stringify({
    t: new Date().toISOString(),
    level,
    scope,
    msg: message,
    ...(fields ? (redact(fields) as Fields) : {}),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function createLogger(scope: string, base?: Fields) {
  const merge = (f?: Fields) => ({ ...base, ...f });
  return {
    debug: (m: string, f?: Fields) => emit("debug", scope, m, merge(f)),
    info: (m: string, f?: Fields) => emit("info", scope, m, merge(f)),
    warn: (m: string, f?: Fields) => emit("warn", scope, m, merge(f)),
    error: (m: string, f?: Fields) => emit("error", scope, m, merge(f)),
    child: (extra: Fields) => createLogger(scope, { ...base, ...extra }),
  };
}

export type Logger = ReturnType<typeof createLogger>;
