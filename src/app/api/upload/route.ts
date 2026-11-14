import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase/server";
import { apiError, HttpError, sameOrigin } from "@/server/http";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const db = await serverDb();
    const { data, error } = await db.auth.getClaims();
    if (error || !data?.claims.sub) throw new HttpError(401, "Please sign in.");
    if (Number(req.headers.get("content-length")) > 5300000)
      throw new HttpError(413, "Photo must be 5 MB or smaller.");
    const form = await req.formData();
    const file = form.get("photo");
    if (!(file instanceof File) || file.size > 5242880 || file.size < 12)
      throw new HttpError(400, "Choose an image under 5 MB.");
    const b = Buffer.from(await file.arrayBuffer());
    const jpeg = b[0] === 255 && b[1] === 216 && b[2] === 255,
      png = b
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
      webp =
        b.subarray(0, 4).toString() === "RIFF" &&
        b.subarray(8, 12).toString() === "WEBP";
    const mime = jpeg
      ? "image/jpeg"
      : png
        ? "image/png"
        : webp
          ? "image/webp"
          : null;
    if (!mime || mime !== file.type)
      throw new HttpError(400, "Choose a valid JPEG, PNG or WebP photo.");
    const path = `${data.claims.sub}/${randomUUID()}.${jpeg ? "jpg" : png ? "png" : "webp"}`;
    const { error: upload } = await db.storage
      .from("wedding-photos")
      .upload(path, b, { contentType: mime, upsert: false });
    if (upload) throw upload;
    return NextResponse.json({
      url: db.storage.from("wedding-photos").getPublicUrl(path).data.publicUrl,
    });
  } catch (e) {
    return apiError(e);
  }
}
