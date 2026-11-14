import { createServerClient } from "@supabase/ssr";
import type { Browser } from "@playwright/test";
export async function ownerSession(
  browser: Browser,
  baseURL: string,
  email: string,
  password: string,
) {
  const context = await browser.newContext({ baseURL });
  const jar = new Map<string, string>();
  const db = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
        async setAll(cookies) {
          for (const { name, value } of cookies) jar.set(name, value);
          await context.addCookies(
            cookies.map(({ name, value, options }) => ({
              name,
              value,
              url: baseURL,
              httpOnly: options.httpOnly || false,
              secure: new URL(baseURL).protocol === "https:",
              sameSite: "Lax" as const,
              ...(options.maxAge
                ? { expires: Math.floor(Date.now() / 1000) + options.maxAge }
                : {}),
            })),
          );
        },
      },
    },
  );
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error || !data.user || !data.session) {
    await context.close();
    throw new Error(
      "Isolated test-account password sign-in failed. Check local E2E credentials and Email provider configuration.",
    );
  }
  return { context, db, user: data.user };
}
