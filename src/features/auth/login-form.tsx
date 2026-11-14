"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { browserDb } from "@/lib/supabase/browser";
import { safeNext } from "@/lib/utils";
import { Button } from "@/components/ui/button";
export function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState(""),
    [otp, setOtp] = useState(""),
    [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(
      params.get("error")
        ? "Sign-in could not be completed. Please try again."
        : "",
    );
  const next = safeNext(params.get("next"));
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="card stack">
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <Button
        className="w-full"
        variant="outline"
        disabled={busy}
        onClick={() =>
          run(async () => {
            const { error } = await browserDb().auth.signInWithOAuth({
              provider: "google",
              options: {
                redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
              },
            });
            if (error) throw error;
          })
        }
      >
        Continue with Google
      </Button>
      <div className="divider text-xs">or use email</div>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const db = browserDb();
            if (!sent) {
              const { error } = await db.auth.signInWithOtp({
                email,
                options: { shouldCreateUser: true },
              });
              if (error) throw error;
              setSent(true);
            } else {
              const { error } = await db.auth.verifyOtp({
                email,
                token: otp,
                type: "email",
              });
              if (error) throw error;
              location.assign(next);
            }
          });
        }}
      >
        <div>
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            disabled={sent}
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {sent && (
          <div>
            <label htmlFor="otp">Code from your email</label>
            <input
              id="otp"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              maxLength={10}
            />
            <p className="muted text-sm mt-2">
              Check your inbox and spam folder for the sign-in code.
            </p>
          </div>
        )}
        <Button className="w-full" disabled={busy} type="submit">
          {busy
            ? "Please wait…"
            : sent
              ? "Verify & continue"
              : "Email me a sign-in code"}
        </Button>
        {sent && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setSent(false);
              setOtp("");
            }}
          >
            Use another email or resend
          </Button>
        )}
      </form>
      <p className="text-xs muted">
        Your dashboard and guest records stay private to your account.
      </p>
    </div>
  );
}
