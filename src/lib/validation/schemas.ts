import { z } from "zod";
export const goalSchema = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().min(1).max(100),
  target_amount_paise: z.number().int().positive().max(100000000000),
  icon: z.enum(["heart", "home", "plane"]),
  note: z.string().trim().max(400),
});
export const weddingSchema = z.object({
  partner1_name: z.string().trim().min(1).max(80),
  partner2_name: z.string().trim().min(1).max(80),
  wedding_date: z.iso.date(),
  slug: z
    .string()
    .min(3)
    .max(64)
    .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers and single hyphens.",
    ),
  photo_url: z.union([z.literal(""), z.url()]),
  message: z.string().trim().max(1500),
  goals: z.array(goalSchema).max(3),
  publish: z.boolean(),
});
export type WeddingInput = z.infer<typeof weddingSchema>;
export const giftSchema = z
  .object({
    slug: z
      .string()
      .min(3)
      .max(64)
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    goal_id: z.uuid().nullable(),
    amount_paise: z.number().int().positive().max(100000000),
    guest_name: z.string().trim().min(1).max(100),
    blessing_message: z.string().trim().max(1000),
    envelope_design: z.enum(["red", "floral", "gold"]),
    request_key: z.uuid(),
    attempt_key: z.uuid(),
    receipt_token: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const receiptSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
});
export function validateAmount(amount: number, min: number, max: number) {
  if (!Number.isSafeInteger(amount) || amount < min || amount > max)
    throw new Error("Amount is outside the allowed contribution range.");
  return amount;
}
