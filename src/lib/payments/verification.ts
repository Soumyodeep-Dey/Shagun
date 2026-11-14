import { createHash, createHmac, timingSafeEqual } from "node:crypto";
export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export function validSignature(
  message: string,
  signature: string,
  secret: string,
) {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(message).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
export type ProviderPayment = {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
  captured?: boolean;
};
export function capturedPayment(
  p: ProviderPayment,
  order: string,
  amount: number,
) {
  return (
    p.order_id === order &&
    p.amount === amount &&
    p.currency === "INR" &&
    p.status === "captured" &&
    p.captured === true
  );
}
export function nextStatus(current: string, incoming: string) {
  return current === "succeeded" ? "succeeded" : incoming;
}
