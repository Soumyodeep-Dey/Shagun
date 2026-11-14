"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { PaymentStatus, PaymentMode } from "@/lib/types";
import { money } from "@/lib/utils";
type Receipt = {
  status: PaymentStatus;
  mode: PaymentMode;
  amount_paise: number;
};
export function ReceiptView() {
  const [receipt, setReceipt] = useState<Receipt | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    setError("");
    try {
      const token = location.hash.slice(1);
      if (!/^[a-f0-9]{64}$/.test(token))
        throw new Error(
          "Open your private receipt link from the checkout. A success URL alone is not proof of payment.",
        );
      const res = await fetch("/api/receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setReceipt(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Receipt unavailable.");
    } finally {
      setLoading(false);
    }
  }
  // The receipt token lives in the browser fragment; read it only after hydration.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Receipt fragment is available only in the browser.
    load();
  }, []);
  const success = receipt?.status === "succeeded";
  return (
    <div className="card text-center stack">
      {loading ? (
        <p role="status">Checking your payment securely…</p>
      ) : error ? (
        <>
          <h1 className="text-4xl">Your private receipt</h1>
          <p role="alert" className="error">
            {error}
          </p>
        </>
      ) : (
        receipt && (
          <>
            {success && (
              <div className="confetti" aria-hidden="true">
                ✦ ♡ ✦
              </div>
            )}
            <p className="eyebrow">
              {receipt.mode === "mock"
                ? "Demo receipt"
                : "Razorpay test receipt"}
            </p>
            <h1 className="text-4xl">
              {success
                ? receipt.mode === "mock"
                  ? "Your demo blessing is delivered."
                  : "Your Shagun is confirmed."
                : receipt.status === "pending"
                  ? "Awaiting confirmation."
                  : receipt.status === "cancelled"
                    ? "Checkout was cancelled."
                    : "Payment did not complete."}
            </h1>
            <p className="text-3xl font-serif text-maroon">
              {money(receipt.amount_paise)}
            </p>
            <p className="muted">
              {success
                ? "Thank you for being part of their new beginning."
                : receipt.status === "pending"
                  ? "We haven’t confirmed a captured payment. Please check again before attempting another payment."
                  : "No successful payment has been confirmed. You can return to your envelope to retry."}
            </p>
            <p className="notice">
              {receipt.mode === "mock"
                ? "Successful mock payments are simulations. No money transferred."
                : "Razorpay TEST MODE. No live funds or recipient settlements."}
            </p>
          </>
        )
      )}
      {!loading && (
        <div className="actions justify-center">
          <Button variant="outline" onClick={load}>
            Check status again
          </Button>
          <Button asChild variant="ghost">
            <Link href="/">Back to Shagun</Link>
          </Button>
        </div>
      )}
      <p className="text-xs muted">
        Keep this receipt link private. It grants access only to this gift’s
        payment status.
      </p>
    </div>
  );
}
