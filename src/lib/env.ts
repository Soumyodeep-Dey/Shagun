import "server-only";
import type { PaymentMode } from "./types";
export class ConfigurationError extends Error {}
export function required(name: string) {
  const value = process.env[name];
  if (!value) throw new ConfigurationError(`Configuration required: ${name}`);
  return value;
}
export function appUrl() {
  const url = new URL(required("NEXT_PUBLIC_APP_URL"));
  if (
    url.protocol !== "https:" &&
    url.hostname !== "localhost" &&
    url.hostname !== "127.0.0.1"
  )
    throw new ConfigurationError("Use HTTPS for APP_URL");
  return url.origin;
}
export function paymentMode(): PaymentMode {
  const mode = required("PAYMENT_MODE");
  if (mode !== "mock" && mode !== "razorpay_test")
    throw new ConfigurationError(
      "PAYMENT_MODE must be mock or razorpay_test. Live mode is disabled.",
    );
  if (mode === "razorpay_test") {
    if (!required("RAZORPAY_KEY_ID").startsWith("rzp_test_"))
      throw new ConfigurationError(
        "Configuration error: Razorpay TEST keys required. Live keys are rejected.",
      );
    required("RAZORPAY_KEY_SECRET");
    required("RAZORPAY_WEBHOOK_SECRET");
  }
  return mode;
}
export function limits() {
  const min = Number(process.env.MIN_CONTRIBUTION_PAISE || 10000),
    max = Number(process.env.MAX_CONTRIBUTION_PAISE || 10000000);
  if (
    !Number.isSafeInteger(min) ||
    !Number.isSafeInteger(max) ||
    min < 100 ||
    max < min ||
    max > 100000000
  )
    throw new ConfigurationError("Invalid contribution limit configuration");
  return { min, max };
}
