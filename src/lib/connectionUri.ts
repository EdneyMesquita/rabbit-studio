/** One fact read out of a management URL, shown as a chip under it. */
export interface UriFact {
  label: string;
  value?: string;
  suffix?: string;
}

function decode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** The management URL read for a quick visual check, or why it can't be. */
export type ParsedManagementUrl = { ok: true; facts: UriFact[] } | { ok: false; error: string };

/**
 * What a management API URL says - `https://user:pass@host:15671/prefix` -
 * as chips: host, port (the scheme's default when none is given, as the
 * backend reads it), TLS, the API path and the user. Never shows the
 * password. Null for an empty field; the backend is the one that validates.
 */
export function parseManagementUrl(url: string): ParsedManagementUrl | null {
  const text = url.trim();
  if (!text) return null;
  const match = /^(https?):\/\/([^/?#]*)([^?#]*)/i.exec(text);
  if (!match) return { ok: false, error: "Use http(s)://host:port, the port of the management plugin (15672, or 15671 over TLS)." };
  const [, scheme, authority, path] = match;
  const at = authority.lastIndexOf("@");
  const userinfo = at >= 0 ? authority.slice(0, at) : "";
  const hostPort = at >= 0 ? authority.slice(at + 1) : authority;
  const portMatch = /^(\[[^\]]*\]|[^:]*)(?::(\d*))?$/.exec(hostPort);
  const host = portMatch?.[1] ?? "";
  if (!host) return { ok: false, error: "The URL has no host." };
  const tls = scheme.toLowerCase() === "https";
  const port = portMatch?.[2] ? portMatch[2] : tls ? "443" : "80";
  const prefix = path.replace(/\/+$/, "");
  const facts: UriFact[] = [
    { label: "host", value: decode(host) },
    { label: "port", value: port, suffix: portMatch?.[2] ? undefined : "(the scheme's default)" },
    { label: "TLS", value: tls ? "yes" : "no" },
    { label: "API", value: `${prefix}/api` },
  ];
  if (userinfo) {
    const [user, password] = userinfo.split(/:(.*)/s);
    if (user) facts.push({ label: "user", value: decode(user) });
    if (password !== undefined) facts.push({ label: "password", suffix: "moves to the keychain" });
  }
  return { ok: true, facts };
}

/** The user name in a URL's `user:pass@`, decoded; null when it has none. */
export function urlUser(url: string): string | null {
  const match = /^https?:\/\/([^@/?#]*)@/i.exec(url.trim());
  if (!match) return null;
  return decode(match[1].split(":")[0]) || null;
}

/** Whether a host field holds a whole URL (pasted), which the URL field should take instead. */
export function looksLikeUrl(text: string): boolean {
  return /^https?:\/\//i.test(text.trim());
}
