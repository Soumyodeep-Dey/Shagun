import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ownerWedding,
  ownerGifts,
  ownerSummary,
} from "@/server/services/weddings";
import { money, thankYou } from "@/lib/utils";
import { summaryTotal } from "@/lib/dashboard";
import { appUrl } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { ShareTools, ThankYouTool } from "@/features/dashboard/tools";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Your private dashboard",
  robots: { index: false, follow: false },
};
export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const w = await ownerWedding();
  if (!w) redirect("/create");
  const query = await searchParams,
    page = Math.max(1, Math.min(100000, Math.floor(Number(query.page) || 1)));
  const [{ gifts, count }, summary] = await Promise.all([
    ownerGifts(w.id, page),
    ownerSummary(),
  ]);
  const couple = `${w.partner1_name} & ${w.partner2_name}`;
  return (
    <div className="shell page">
      <div className="flex flex-wrap justify-between items-start gap-5 mb-9">
        <div>
          <p className="eyebrow mb-3">Just for the two of you</p>
          <h1 className="text-5xl mb-4">Hello, {couple}.</h1>
          <span className="pill">
            {w.published_at ? "Published" : "Private draft"}
          </span>
        </div>
        <div className="actions">
          <Button asChild variant="outline">
            <Link href="/create">Edit your page</Link>
          </Button>
          <form action="/auth/logout" method="post">
            <Button variant="ghost">Sign out</Button>
          </form>
        </div>
      </div>
      <p className="notice mb-7">
        Test-only dashboard. Demo and Razorpay test totals below are simulated
        funds, not real money received. Bank details, UPI IDs, recipient
        onboarding and settlements are not configured.
      </p>
      <div className="grid grid-3 mb-8">
        <div className="card">
          <p className="eyebrow mb-3">Confirmed demo Shagun</p>
          <h2 className="mb-2">{money(summaryTotal(summary, "mock"))}</h2>
          <p className="text-sm muted">
            Mock simulations · no money transferred
          </p>
        </div>
        <div className="card">
          <p className="eyebrow mb-3">Captured Razorpay test</p>
          <h2 className="mb-2">
            {money(summaryTotal(summary, "razorpay_test"))}
          </h2>
          <p className="text-sm muted">Verified captured test payments only</p>
        </div>
        <div className="card">
          <p className="eyebrow mb-3">Awaiting confirmation</p>
          <h2 className="mb-2">{summary.pending_count}</h2>
          <p className="text-sm muted">Pending gifts excluded from totals</p>
        </div>
      </div>
      <section className="card mb-8">
        <h2 className="text-3xl mb-6">Your dreams, privately</h2>
        <div className="grid grid-3">
          {[
            {
              id: null,
              title: "For your new beginning",
              target_amount_paise: 0,
            },
            ...w.goals,
          ].map((g) => (
            <div
              key={g.id || "general"}
              className="border border-[#e7d9c9] rounded-xl p-5"
            >
              <h3 className="text-xl mb-4">
                {g.title}
                {"is_active" in g && !g.is_active ? " · archived" : ""}
              </h3>
              {(["mock", "razorpay_test"] as const).map((mode) => {
                const total = summaryTotal(summary, mode, g.id);
                return (
                  <div key={mode} className="mb-3">
                    <p className="text-sm muted">
                      {mode === "mock" ? "Demo" : "Razorpay test"}:{" "}
                      <span className="text-maroon">{money(total)}</span>
                    </p>
                    {g.target_amount_paise > 0 && (
                      <>
                        <progress
                          value={Math.min(total, g.target_amount_paise)}
                          max={g.target_amount_paise}
                          aria-label={`${g.title}, ${mode} private progress`}
                        />
                        <p className="text-xs muted">
                          {Math.round((total / g.target_amount_paise) * 100)}%
                          of private target {money(g.target_amount_paise)}
                        </p>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>
      <section className="card mb-8">
        <h2 className="text-3xl mb-5">Share a little joy</h2>
        {w.published_at ? (
          <ShareTools url={`${appUrl()}/w/${w.slug}`} />
        ) : (
          <p className="muted">
            Publish your wedding page before sharing its link.
          </p>
        )}
      </section>
      <section className="card">
        <h2 className="text-3xl mb-6">Shagun & blessings</h2>
        <p className="muted text-sm mb-4">
          {count} gifts · page {page} · totals include every page
        </p>
        {!gifts.length ? (
          <div className="text-center py-10">
            <p className="font-serif text-2xl text-maroon mb-3">
              A little space for a lot of love.
            </p>
            <p className="muted">
              Your guests’ gifts and blessings will appear here.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <caption className="sr-only">
                Private gifts, including pending and failed attempts
              </caption>
              <thead>
                <tr>
                  {[
                    "Guest & blessing",
                    "Shagun",
                    "Dream",
                    "Envelope",
                    "Status",
                    "Date",
                    "Thank you",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gifts.map((g) => {
                  const goal = w.goals.find((x) => x.id === g.goal_id);
                  return (
                    <tr key={g.id}>
                      <td className="min-w-52">
                        <strong>{g.guest_name}</strong>
                        <p className="muted whitespace-pre-wrap break-words mt-2">
                          {g.blessing_message || "A gift sent with love."}
                        </p>
                      </td>
                      <td className="whitespace-nowrap">
                        {money(g.amount_paise)}
                        <p className="text-xs muted">
                          {g.payment_mode === "mock" ? "Demo" : "Razorpay TEST"}
                        </p>
                      </td>
                      <td>{goal?.title || "General Shagun"}</td>
                      <td>
                        {g.envelope_design === "red"
                          ? "Traditional Red"
                          : g.envelope_design === "floral"
                            ? "Floral"
                            : "Minimal Gold"}
                      </td>
                      <td>
                        <span className="pill">
                          {g.payment_status === "succeeded"
                            ? "Confirmed"
                            : g.payment_status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap">
                        {new Intl.DateTimeFormat("en-IN", {
                          dateStyle: "medium",
                          timeZone: "Asia/Kolkata",
                        }).format(new Date(g.created_at))}
                      </td>
                      <td>
                        {g.payment_status === "succeeded" ? (
                          <ThankYouTool
                            id={g.id}
                            text={thankYou(g.guest_name, couple, goal?.title)}
                            thanked={!!g.thanked_at}
                          />
                        ) : (
                          <span className="muted">After confirmation</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <nav aria-label="Gift pages" className="actions mt-6">
          {page > 1 && (
            <Button asChild variant="outline">
              <Link href={`/dashboard?page=${page - 1}`}>Previous gifts</Link>
            </Button>
          )}
          {page * 50 < count && (
            <Button asChild variant="outline">
              <Link href={`/dashboard?page=${page + 1}`}>More gifts</Link>
            </Button>
          )}
        </nav>
      </section>
    </div>
  );
}
