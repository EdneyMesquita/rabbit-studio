import { describe, expect, it } from "vitest";
import { share } from "./useLive";

describe("share", () => {
  it("keeps the old object when nothing changed", () => {
    const prev = { items: [{ name: "a", n: 1 }], total: 1 };
    const next = JSON.parse(JSON.stringify(prev));
    expect(share(prev, next)).toBe(prev);
  });

  it("keeps unchanged rows and replaces changed ones", () => {
    const prev = [{ name: "a", n: 1 }, { name: "b", n: 2 }];
    const next = [{ name: "a", n: 1 }, { name: "b", n: 3 }];
    const out = share(prev, next);
    expect(out).not.toBe(prev);
    expect(out[0]).toBe(prev[0]);
    expect(out[1]).toEqual({ name: "b", n: 3 });
  });

  it("treats a grown list as new", () => {
    const prev = [1, 2];
    expect(share(prev, [1, 2, 3])).toEqual([1, 2, 3]);
  });
});
