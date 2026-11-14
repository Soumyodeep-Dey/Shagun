import type { Gift, PaymentMode } from "./types";
import type { DashboardSummary } from "./types";
export function summaryTotal(
  summary: DashboardSummary,
  mode: PaymentMode,
  goalId?: string | null,
) {
  return summary.rows
    .filter(
      (row) =>
        row.payment_mode === mode &&
        (goalId === undefined || row.goal_id === goalId),
    )
    .reduce((sum, row) => sum + row.amount_paise, 0);
}
export function totals(gifts: Gift[], mode: PaymentMode) {
  return gifts
    .filter((g) => g.payment_status === "succeeded" && g.payment_mode === mode)
    .reduce((sum, g) => sum + g.amount_paise, 0);
}
export function goalTotal(
  gifts: Gift[],
  goalId: string | null,
  mode: PaymentMode,
) {
  return totals(
    gifts.filter((g) => g.goal_id === goalId),
    mode,
  );
}
