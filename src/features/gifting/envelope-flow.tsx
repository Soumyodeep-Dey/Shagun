"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PublicWedding, PaymentMode } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/utils";
type RazorpayResult = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};
type RazorpayInstance = {
  open: () => void;
  on: (event: string, callback: () => void) => void;
};
declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}
type Draft = {
  amount: string;
  envelope: "red" | "floral" | "gold";
  name: string;
  blessing: string;
  request_key: string;
  receipt_token: string;
  attempt_key: string;
};
function fresh(): Draft {
  return {
    amount: "1001",
    envelope: "red",
    name: "",
    blessing: "",
    request_key: crypto.randomUUID(),
    receipt_token: Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join(""),
    attempt_key: crypto.randomUUID(),
  };
}
async function post(path: string, body: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Please try again.");
  return data;
}
async function checkoutScript() {
  if (window.Razorpay) return;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => {
      s.remove();
      reject(
        new Error(
          "Checkout could not load. Your details are saved; please retry.",
        ),
      );
    };
    document.body.append(s);
  });
}
export function EnvelopeFlow({
  wedding: w,
  goalId,
  mode,
  min,
  max,
}: {
  wedding: PublicWedding;
  goalId: string | null;
  mode: PaymentMode;
  min: number;
  max: number;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null),
    [step, setStep] = useState(1),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [mock, setMock] = useState<{ attempt_id: string } | null>(null);
  const key = `shagun-draft:${w.id}:${goalId || "general"}`;
  const goal = w.goals.find((g) => g.id === goalId);
  // Restore the external session draft after hydration; it is never payment proof.
  useEffect(() => {
    let next = fresh();
    try {
      const stored = sessionStorage.getItem(key);
      if (stored) {
        const d = JSON.parse(stored);
        if (
          d &&
          typeof d.name === "string" &&
          typeof d.amount === "string" &&
          /^[a-f0-9]{64}$/.test(d.receipt_token)
        )
          next = d;
      }
    } catch {
      /* Storage is optional. */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydrate the browser's optional unfinished draft.
    setDraft(next);
  }, [key]);
  function update(p: Partial<Draft>) {
    if (!draft) return;
    const next = {
      ...draft,
      ...p,
      request_key: crypto.randomUUID(),
      receipt_token: fresh().receipt_token,
      attempt_key: crypto.randomUUID(),
    };
    setDraft(next);
    try {
      sessionStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* DB remains authoritative after order creation. */
    }
  }
  function result() {
    if (!draft) return;
    router.push(`/thank-you#${draft.receipt_token}`);
  }
  async function pay() {
    if (!draft) return;
    setError("");
    setBusy(true);
    try {
      try {
        sessionStorage.setItem(key, JSON.stringify(draft));
      } catch {}
      const order = await post("/api/create-order", {
        slug: w.slug,
        goal_id: goalId,
        amount_paise: Math.round(Number(draft.amount) * 100),
        guest_name: draft.name,
        blessing_message: draft.blessing,
        envelope_design: draft.envelope,
        request_key: draft.request_key,
        receipt_token: draft.receipt_token,
        attempt_key: draft.attempt_key,
      });
      if (order.status === "succeeded") {
        result();
        return;
      }
      if (order.mode === "mock") {
        setMock({ attempt_id: order.attempt_id });
        return;
      }
      await checkoutScript();
      const checkout = new window.Razorpay({
        key: order.key_id,
        amount: order.amount_paise,
        currency: "INR",
        order_id: order.order_id,
        name: "Shagun · TEST",
        description: `For ${w.partner1_name} & ${w.partner2_name}`,
        prefill: { name: draft.name },
        theme: { color: "#7A1E2B" },
        handler: async (response: RazorpayResult) => {
          try {
            await post("/api/verify-payment", {
              ...response,
              token: draft.receipt_token,
              attempt_id: order.attempt_id,
            });
            result();
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Confirmation is pending.",
            );
            setBusy(false);
          }
        },
        modal: {
          ondismiss: () => {
            setBusy(false);
            setError(
              "Checkout closed. Your details are saved. You can retry or view the payment status.",
            );
          },
        },
      });
      checkout.on("payment.failed", () => {
        setBusy(false);
        setError(
          "Payment did not complete. Your details are saved. Retry checkout or check your receipt.",
        );
      });
      checkout.open();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout is unavailable.");
    } finally {
      setBusy(false);
    }
  }
  async function simulate(outcome: "succeeded" | "failed" | "cancelled") {
    if (!draft || !mock) return;
    setBusy(true);
    try {
      await post("/api/mock-payment", {
        token: draft.receipt_token,
        attempt_id: mock.attempt_id,
        outcome,
      });
      if (outcome === "succeeded") result();
      else {
        setMock(null);
        const next = { ...draft, attempt_key: crypto.randomUUID() };
        setDraft(next);
        try {
          sessionStorage.setItem(key, JSON.stringify(next));
        } catch {}
        setError(
          `Demo payment ${outcome}. Your envelope and blessing are saved. You can retry or view your receipt.`,
        );
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to complete simulation.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!draft) return <p role="status">Preparing your envelope…</p>;
  return (
    <div className="grid grid-2 items-start">
      <aside className="card">
        <p className="eyebrow mb-4">A little love for</p>
        <h2 className="mb-4">
          {w.partner1_name} & {w.partner2_name}
        </h2>
        <p className="muted mb-8">{goal?.title || "For your new beginning"}</p>
        <div className={`envelope envelope-${draft.envelope}`}>
          <span className="text-3xl font-serif z-10">with love ♡</span>
        </div>
        <p className="notice mt-6">
          {mode === "mock"
            ? "Demo payment — no money transferred."
            : "Razorpay TEST payment — no live money transferred."}
        </p>
        <Link
          className="text-maroon text-sm underline block mt-5"
          href={`/w/${w.slug}`}
        >
          Back to the wedding page
        </Link>
      </aside>
      <div className="card">
        <div
          className="flex justify-between text-xs muted mb-7"
          aria-label={`Step ${step} of 4`}
        >
          {["Amount", "Envelope", "Blessing", "Review"].map((s, i) => (
            <span
              key={s}
              className={step === i + 1 ? "text-maroon font-bold" : ""}
            >
              {i + 1}. {s}
            </span>
          ))}
        </div>
        {error && (
          <p role="alert" className="error mb-6">
            {error}
          </p>
        )}
        {mock ? (
          <div className="stack">
            <h3>Demo checkout</h3>
            <p>No payment details are collected. Choose a test outcome.</p>
            <Button disabled={busy} onClick={() => simulate("succeeded")}>
              Simulate success
            </Button>
            <div className="actions">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => simulate("failed")}
              >
                Simulate failure
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => simulate("cancelled")}
              >
                Cancel demo payment
              </Button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (step < 4) {
                setError("");
                if (
                  step === 1 &&
                  (!/^\d+(\.\d{1,2})?$/.test(draft.amount) ||
                    Number(draft.amount) * 100 < min ||
                    Number(draft.amount) * 100 > max)
                ) {
                  setError(
                    `Choose an amount from ${money(min)} to ${money(max)}.`,
                  );
                  return;
                }
                setStep(step + 1);
              } else pay();
            }}
          >
            {step === 1 && (
              <fieldset>
                <legend className="font-serif text-2xl text-maroon">
                  Choose your Shagun
                </legend>
                <p className="muted mb-5">
                  A gesture of love, in an amount that feels right.
                </p>
                <div className="grid grid-cols-2 gap-3 mb-6">
                  {[501, 1001, 2001, 5001].map((a) => (
                    <Button
                      key={a}
                      type="button"
                      variant={
                        Number(draft.amount) === a ? "default" : "outline"
                      }
                      onClick={() => update({ amount: String(a) })}
                    >
                      {money(a * 100)}
                    </Button>
                  ))}
                </div>
                <label htmlFor="amount">Or enter an amount (₹)</label>
                <input
                  id="amount"
                  type="number"
                  min={min / 100}
                  max={max / 100}
                  step="0.01"
                  required
                  value={draft.amount}
                  onChange={(e) => update({ amount: e.target.value })}
                />
                <p className="text-xs muted mt-2">
                  {money(min)} – {money(max)} · INR only
                </p>
              </fieldset>
            )}
            {step === 2 && (
              <fieldset>
                <legend className="font-serif text-2xl text-maroon">
                  Dress it in love
                </legend>
                <p className="muted mb-5">
                  Choose a digital envelope for your blessing.
                </p>
                <div className="grid gap-5">
                  {[
                    { id: "red", name: "Traditional Red" },
                    { id: "floral", name: "Floral" },
                    { id: "gold", name: "Minimal Gold" },
                  ].map((o) => (
                    <label
                      key={o.id}
                      className={`block rounded-lg p-2 cursor-pointer ${draft.envelope === o.id ? "selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="envelope"
                        value={o.id}
                        checked={draft.envelope === o.id}
                        onChange={() =>
                          update({ envelope: o.id as Draft["envelope"] })
                        }
                        className="sr-only peer"
                      />
                      <div
                        className={`envelope envelope-${o.id} peer-focus-visible:outline peer-focus-visible:outline-2`}
                      >
                        <span className="z-10 font-serif text-lg">
                          {o.name}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {step === 3 && (
              <fieldset>
                <legend className="font-serif text-2xl text-maroon">
                  Words they’ll keep
                </legend>
                <div className="field mt-5">
                  <label htmlFor="guest">Your name</label>
                  <input
                    id="guest"
                    required
                    maxLength={100}
                    autoComplete="name"
                    value={draft.name}
                    onChange={(e) => update({ name: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="blessing">Your blessing (optional)</label>
                  <textarea
                    id="blessing"
                    maxLength={1000}
                    value={draft.blessing}
                    placeholder="Wishing you a lifetime of love…"
                    onChange={(e) => update({ blessing: e.target.value })}
                  />
                  <p className="text-xs muted">
                    Only the couple will see your name and blessing.
                  </p>
                </div>
              </fieldset>
            )}
            {step === 4 && (
              <div className="stack">
                <h3>A gift from the heart</h3>
                <dl className="space-y-3">
                  <div>
                    <dt className="muted text-sm">To</dt>
                    <dd>
                      {w.partner1_name} & {w.partner2_name}
                    </dd>
                  </div>
                  <div>
                    <dt className="muted text-sm">Towards</dt>
                    <dd>{goal?.title || "For your new beginning"}</dd>
                  </div>
                  <div>
                    <dt className="muted text-sm">Your Shagun</dt>
                    <dd className="font-serif text-3xl text-maroon">
                      {money(Math.round(Number(draft.amount) * 100))}
                    </dd>
                  </div>
                  <div>
                    <dt className="muted text-sm">From</dt>
                    <dd>{draft.name}</dd>
                  </div>
                  {draft.blessing && (
                    <div>
                      <dt className="muted text-sm">Your blessing</dt>
                      <dd className="whitespace-pre-wrap break-words">
                        {draft.blessing}
                      </dd>
                    </div>
                  )}
                </dl>
                <p className="notice">
                  {mode === "mock"
                    ? "Demo payment — no money transferred."
                    : "TEST MODE · Razorpay test checkout only."}
                </p>
              </div>
            )}
            <div className="actions mt-8">
              {step > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setStep(step - 1)}
                >
                  Back
                </Button>
              )}
              <Button type="submit" disabled={busy}>
                {busy
                  ? "Preparing…"
                  : step === 4
                    ? "Open checkout"
                    : "Continue"}
              </Button>
            </div>
          </form>
        )}
        <button
          type="button"
          className="text-sm text-maroon underline mt-5"
          onClick={result}
        >
          View my payment status
        </button>
      </div>
    </div>
  );
}
