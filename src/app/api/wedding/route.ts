import { NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase/server";
import { weddingSchema } from "@/lib/validation/schemas";
import { required } from "@/lib/env";
import { apiError, HttpError, readJson, sameOrigin } from "@/server/http";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const db = await serverDb();
    const { data, error } = await db.auth.getClaims();
    if (error || !data?.claims.sub)
      throw new HttpError(401, "Sign in to save your wedding.");
    const input = weddingSchema.parse(await readJson(req));
    if (
      input.photo_url &&
      !input.photo_url.startsWith(
        `${required("NEXT_PUBLIC_SUPABASE_URL")}/storage/v1/object/public/wedding-photos/${data.claims.sub}/`,
      )
    )
      throw new HttpError(400, "Choose a photo uploaded to your own wedding.");
    const { error: saveError } = await db.rpc("save_wedding", { p: input });
    if (saveError) {
      if (saveError.code === "23505")
        throw new HttpError(
          409,
          "That wedding link is already taken. Choose another.",
        );
      throw saveError;
    }
    return NextResponse.json({
      saved: true,
      published: input.publish,
      slug: input.slug,
    });
  } catch (e) {
    return apiError(e);
  }
}
