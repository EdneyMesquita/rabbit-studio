import { describe, expect, it } from "vitest";
import { looksLikeUrl, parseManagementUrl, urlUser } from "./connectionUri";

const facts = (url: string) => {
  const parsed = parseManagementUrl(url);
  if (!parsed?.ok) throw new Error("expected a parsed URL");
  return Object.fromEntries(parsed.facts.map((f) => [f.label, f.value ?? f.suffix]));
};

describe("parseManagementUrl", () => {
  it("reads host, port, TLS, prefix and user, never the password", () => {
    expect(facts("https://alice:s3cret@mq.example.com:15671/rabbit/")).toEqual({
      host: "mq.example.com",
      port: "15671",
      TLS: "yes",
      API: "/rabbit/api",
      user: "alice",
      password: "moves to the keychain",
    });
  });

  it("falls back to the scheme's port", () => {
    expect(facts("http://localhost")).toMatchObject({ port: "80", TLS: "no", API: "/api" });
  });

  it("keeps IPv6 hosts whole", () => {
    expect(facts("http://[::1]:15672")).toMatchObject({ host: "[::1]", port: "15672" });
  });

  it("explains what it can't read", () => {
    expect(parseManagementUrl("amqp://host:5672")).toMatchObject({ ok: false });
    expect(parseManagementUrl("   ")).toBeNull();
  });
});

describe("looksLikeUrl", () => {
  it("spots a pasted URL", () => {
    expect(looksLikeUrl(" https://h:15671")).toBe(true);
    expect(looksLikeUrl("rabbit.internal")).toBe(false);
  });
});

describe("urlUser", () => {
  it("reads the user out of the URL", () => {
    expect(urlUser("https://ops%40corp:pw@h:15671")).toBe("ops@corp");
    expect(urlUser("http://h:15672")).toBeNull();
  });
});
