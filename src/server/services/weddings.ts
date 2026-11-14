import "server-only";
import { redirect } from "next/navigation";
import { serverDb } from "@/lib/supabase/server";
import { adminDb } from "@/lib/supabase/admin";
import type {
  PublicWedding,
  OwnerWedding,
  Gift,
  DashboardSummary,
} from "@/lib/types";
export async function requireOwner() {
  const db = await serverDb();
  const { data, error } = await db.auth.getClaims();
  if (error || !data?.claims?.sub) redirect("/login");
  return { db, userId: data.claims.sub as string };
}
export async function publicWedding(
  slug: string,
): Promise<PublicWedding | null> {
  const db = adminDb();
  const { data, error } = await db
    .from("couples")
    .select(
      "id,slug,partner1_name,partner2_name,wedding_date,photo_url,message",
    )
    .eq("slug", slug)
    .not("published_at", "is", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { data: goals, error: ge } = await db
    .from("goals")
    .select("id,title,icon,note")
    .eq("couple_id", data.id)
    .eq("is_active", true)
    .order("sort_order");
  if (ge) throw ge;
  return { ...data, goals: goals || [] } as PublicWedding;
}
export async function ownerWedding(): Promise<OwnerWedding | null> {
  const { db, userId } = await requireOwner();
  const { data, error } = await db
    .from("couples")
    .select(
      "id,user_id,slug,partner1_name,partner2_name,wedding_date,photo_url,message,published_at,goals(id,title,icon,note,target_amount_paise,is_active,sort_order)",
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as OwnerWedding | null;
}
export async function ownerGifts(
  coupleId: string,
  page = 1,
): Promise<{ gifts: Gift[]; count: number }> {
  const { db } = await requireOwner();
  const { data, error, count } = await db
    .from("contributions")
    .select(
      "id,goal_id,guest_name,amount_paise,blessing_message,envelope_design,payment_status,payment_mode,thanked_at,created_at",
      { count: "exact" },
    )
    .eq("couple_id", coupleId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range((page - 1) * 50, page * 50 - 1);
  if (error) throw error;
  return { gifts: (data || []) as Gift[], count: count || 0 };
}
export async function ownerSummary(): Promise<DashboardSummary> {
  const { db } = await requireOwner();
  const { data, error } = await db.rpc("dashboard_summary");
  if (error) throw error;
  return data as DashboardSummary;
}
