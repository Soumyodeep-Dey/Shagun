import Link from "next/link";
import { CouplePhoto } from "@/components/couple-photo";
import { Heart, Home, Plane, LockKeyhole, ArrowRight } from "lucide-react";
import type { PublicWedding } from "@/lib/types";
import { weddingDate, countdown } from "@/lib/utils";
import { Button } from "@/components/ui/button";
export function WeddingView({
  wedding: w,
  preview = false,
}: {
  wedding: PublicWedding;
  preview?: boolean;
}) {
  const icons = { heart: Heart, home: Home, plane: Plane };
  return (
    <div>
      <section className="text-center max-w-3xl mx-auto py-8">
        <p className="eyebrow mb-6">With full hearts, we’re getting married</p>
        <CouplePhoto
          src={w.photo_url}
          names={`${w.partner1_name} and ${w.partner2_name}`}
        />
        <h1 className="mb-5">
          {w.partner1_name} <span className="text-gold italic">&</span>{" "}
          {w.partner2_name}
        </h1>
        <p className="text-maroon tracking-wide mb-4">
          {weddingDate(w.wedding_date)}
        </p>
        <span className="pill">{countdown(w.wedding_date)}</span>
        <div className="divider my-8">✦</div>
        <p className="muted text-lg whitespace-pre-wrap">{w.message}</p>
      </section>
      <section className="py-12">
        <div className="text-center mb-9">
          <p className="eyebrow mb-3">Blessings for our next chapter</p>
          <h2>Dreams we’re making together</h2>
        </div>
        <div className={`grid ${w.goals.length === 1 ? "grid-2" : "grid-3"}`}>
          {[
            ...w.goals,
            {
              id: "general",
              title: "For your new beginning",
              icon: "heart" as const,
              note: "A little love for whatever comes next. Your blessings mean the world.",
            },
          ].map((g) => {
            const Icon = icons[g.icon] || Heart;
            return (
              <article className="card flex flex-col" key={g.id}>
                <div className="dream-icon">
                  <Icon />
                </div>
                <h3 className="mb-4">{g.title}</h3>
                <p className="muted mb-7 grow">{g.note}</p>
                {preview ? (
                  <Button disabled>Give Shagun · preview</Button>
                ) : (
                  <Button asChild>
                    <Link
                      href={`/w/${w.slug}/give${g.id === "general" ? "" : `?goal=${g.id}`}`}
                    >
                      Give Shagun <ArrowRight size={16} />
                    </Link>
                  </Button>
                )}
              </article>
            );
          })}
        </div>
        <p className="text-sm muted mt-8 text-center flex justify-center items-center gap-2">
          <LockKeyhole size={15} /> Your gift and blessing are private to the
          couple. No signup needed.
        </p>
      </section>
    </div>
  );
}
