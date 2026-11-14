import { notFound } from "next/navigation";
import { publicWedding } from "@/server/services/weddings";
import { WeddingView } from "@/features/wedding/view";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "A wedding invitation",
  robots: { index: false, follow: false },
};
export default async function Wedding({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const wedding = await publicWedding(slug);
  if (!wedding) notFound();
  return (
    <div className="shell page">
      {slug === "aisha-rahul" && (
        <p className="notice mb-6">
          Demo couple · test gifting only. No real money is received.
        </p>
      )}
      <WeddingView wedding={wedding} />
    </div>
  );
}
