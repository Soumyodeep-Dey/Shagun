import "server-only";
import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { appUrl, required, ConfigurationError } from "@/lib/env";
import { adminDb } from "@/lib/supabase/admin";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function sameOrigin(req: Request) {
  if (req.headers.get("origin") !== appUrl())
    throw new HttpError(403, "Request origin rejected.");
}
export async function readJson(req: Request) {
  const body = await req.text();
  if (Buffer.byteLength(body) > 24000)
    throw new HttpError(413, "Request too large.");
  try {
    return JSON.parse(body);
  } catch {
    throw new HttpError(400, "Invalid JSON.");
  }
}
export async function rateLimit(req: Request, scope: string, maximum = 20) {
  let identity = "shared";
  if (process.env.TRUSTED_PROXY === "vercel" && process.env.VERCEL === "1")
    identity =
      req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
      "shared";
  const secret = required("RATE_LIMIT_SECRET");
  if (secret.length < 32)
    throw new ConfigurationError(
      "RATE_LIMIT_SECRET must be at least 32 characters",
    );
  const key = createHmac("sha256", secret)
    .update(`${scope}:${identity}`)
    .digest("hex");
  const { data, error } = await adminDb().rpc("take_rate_limit", {
    k: key,
    maximum,
    seconds: 60,
  });
  if (error) throw error;
  if (!data)
    throw new HttpError(
      429,
      "Too many requests. Please try again in a minute.",
    );
}
export function apiError(error: unknown) {
  if (error instanceof ConfigurationError)
    return NextResponse.json({ error: error.message }, { status: 503 });
  if (error instanceof ZodError)
    return NextResponse.json(
      { error: error.issues[0]?.message || "Invalid request." },
      { status: 400 },
    );
  if (error instanceof HttpError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : undefined;
  console.error(
    JSON.stringify({
      level: "error",
      event: "request_failed",
      code: code || "internal",
    }),
  );
  return NextResponse.json(
    {
      error:
        "Unable to complete this request. Check server configuration or try again.",
    },
    { status: 503 },
  );
}
