import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export function money(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: paise % 100 ? 2 : 0,
  }).format(paise / 100);
}
export function weddingDate(date: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(`${date}T12:00:00+05:30`));
}
export function countdown(date: string, now = new Date()) {
  const days = Math.ceil(
    (new Date(`${date}T00:00:00+05:30`).getTime() - now.getTime()) / 86400000,
  );
  return days > 0
    ? `${days} days to forever`
    : days === 0
      ? "Today begins forever"
      : "Our new beginning has begun";
}
export function safeNext(value: string | null) {
  return value &&
    /^\/(?!\/)/.test(value) &&
    !/[\\\r\n]/.test(value) &&
    !value.startsWith("/auth") &&
    !value.startsWith("/login")
    ? value
    : "/dashboard";
}
export function thankYou(name: string, couple: string, goal?: string) {
  return `Dear ${name}, thank you for your thoughtful Shagun and blessings${goal ? ` towards ${goal}` : " for our new beginning"}. Your love means so much as we begin this chapter together. With love, ${couple}`;
}
