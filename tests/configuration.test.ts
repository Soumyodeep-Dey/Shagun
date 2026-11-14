import { it, expect, afterEach, vi } from "vitest";
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}));
import { serverDb } from "@/lib/supabase/server";
import { adminDb } from "@/lib/supabase/admin";
import { apiError } from "@/server/http";
const original = { ...process.env };
it("missing publishable key returns a safe configuration error from the real SSR client factory", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.invalid";
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  await expect(serverDb()).rejects.toThrow(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  );
});
afterEach(() => {
  process.env = { ...original };
});
it.each(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"])(
  "missing server %s fails closed without logging secrets",
  async (key) => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.invalid";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "private-sentinel-never-log";
    delete process.env[key];
    let caught: unknown;
    try {
      adminDb();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    const res = apiError(caught);
    expect(res.status).toBe(503);
    const body = await res.text();
    expect(body).toContain(key);
    expect(body).not.toContain("private-sentinel-never-log");
  },
);
