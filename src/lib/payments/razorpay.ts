import "server-only";
import { required, paymentMode } from "@/lib/env";
import { HttpError } from "@/server/http";
export async function razorpay<T>(path: string, body?: object): Promise<T> {
  if (paymentMode() !== "razorpay_test")
    throw new HttpError(409, "Razorpay test mode is not enabled.");
  const res = await fetch(`https://api.razorpay.com/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(`${required("RAZORPAY_KEY_ID")}:${required("RAZORPAY_KEY_SECRET")}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok)
    throw new HttpError(
      502,
      "Payment provider is unavailable. Your payment remains awaiting confirmation.",
    );
  return res.json();
}
