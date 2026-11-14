"use client";
import { useState } from "react";
import Image from "next/image";
import { Heart } from "lucide-react";
export function CouplePhoto({
  src,
  names,
}: {
  src: string | null;
  names: string;
}) {
  const [failed, setFailed] = useState(false);
  const storage = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const allowed =
    src &&
    storage &&
    src.startsWith(`${storage}/storage/v1/object/public/wedding-photos/`);
  if (!allowed || failed)
    return (
      <div
        className="dream-icon mx-auto !w-24 !h-24"
        aria-label="Wedding hearts"
      >
        <Heart size={38} />
      </div>
    );
  const local =
    new URL(storage).hostname === "127.0.0.1" ||
    new URL(storage).hostname === "localhost";
  return (
    <div className="relative w-48 h-56 rounded-t-full rounded-b-xl overflow-hidden mx-auto mb-7">
      <Image
        src={src}
        alt={names}
        fill
        sizes="192px"
        className="object-cover"
        unoptimized={local}
        onError={() => setFailed(true)}
      />
    </div>
  );
}
