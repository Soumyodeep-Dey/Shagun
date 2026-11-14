import Link from "next/link";
export default function NotFound() {
  return (
    <div className="shell page">
      <h1 className="text-4xl mb-6">This invitation isn’t available</h1>
      <p className="muted mb-6">
        Check the link with the couple. Their page may still be a draft.
      </p>
      <Link href="/" className="text-maroon underline">
        Back to Shagun
      </Link>
    </div>
  );
}
