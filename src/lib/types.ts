export type Goal = {
  id: string;
  title: string;
  icon: "heart" | "home" | "plane";
  note: string;
};
export type PublicWedding = {
  id: string;
  slug: string;
  partner1_name: string;
  partner2_name: string;
  wedding_date: string;
  photo_url: string | null;
  message: string;
  goals: Goal[];
};
export type OwnerGoal = Goal & {
  target_amount_paise: number;
  is_active: boolean;
  sort_order: number;
};
export type OwnerWedding = Omit<PublicWedding, "goals"> & {
  user_id: string;
  published_at: string | null;
  goals: OwnerGoal[];
};
export type PaymentMode = "mock" | "razorpay_test";
export type PaymentStatus = "pending" | "succeeded" | "failed" | "cancelled";
export type Gift = {
  id: string;
  goal_id: string | null;
  guest_name: string;
  amount_paise: number;
  blessing_message: string;
  envelope_design: string;
  payment_status: PaymentStatus;
  payment_mode: PaymentMode;
  thanked_at: string | null;
  created_at: string;
};
export type DashboardSummary = {
  pending_count: number;
  rows: {
    goal_id: string | null;
    payment_mode: PaymentMode;
    amount_paise: number;
  }[];
};
