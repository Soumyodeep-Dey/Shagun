import { notFound } from "next/navigation";
import { publicWedding } from "@/server/services/weddings";
import { paymentMode, limits } from "@/lib/env";
import { EnvelopeFlow } from "@/features/gifting/envelope-flow";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Give Shagun",
  robots: { index: false, follow: false },
};
export default async function Give({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ goal?: string }>;
}) {
  const { slug } = await params,
    { goal } = await searchParams;
  const w = await publicWedding(slug);
  if (!w || (goal && !w.goals.some((g) => g.id === goal))) notFound();
  const { min, max } = limits();
  return (
    <div className="shell page max-w-5xl">
      <p className="eyebrow mb-4">No account needed. Just a little love.</p>
      <h1 className="text-5xl mb-9">An envelope of blessings.</h1>
      <EnvelopeFlow
        wedding={w}
        goalId={goal || null}
        mode={paymentMode()}
        min={min}
        max={max}
      />
    </div>
  );
}
