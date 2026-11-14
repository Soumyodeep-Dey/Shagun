import { ownerWedding } from "@/server/services/weddings";
import { WeddingEditor } from "@/features/wedding/editor";
export const dynamic = "force-dynamic";
export default async function Create() {
  const wedding = await ownerWedding();
  return (
    <div className="shell page max-w-4xl">
      <p className="eyebrow mb-4">Your next chapter</p>
      <h1 className="text-5xl mb-5">
        {wedding ? "Make it yours." : "A page full of possibility."}
      </h1>
      <p className="muted mb-8">
        A warm welcome, a few dreams, and a place for your loved ones’
        blessings.
      </p>
      <WeddingEditor initial={wedding} />
    </div>
  );
}
