import { describe, it, expect, vi } from "vitest";
const selections: string[] = [];
vi.mock("@/lib/supabase/admin", () => ({
  adminDb: () => ({
    from: (table: string) => {
      const builder = {
        select: (fields: string) => {
          selections.push(fields);
          return builder;
        },
        eq: () => builder,
        not: () => builder,
        maybeSingle: async () => ({
          data: {
            id: "w",
            slug: "a-b",
            partner1_name: "A",
            partner2_name: "B",
            wedding_date: "2026-12-01",
            photo_url: null,
            message: "Welcome",
          },
          error: null,
        }),
        order: async () => ({
          data:
            table === "goals"
              ? [{ id: "g", title: "Dream", icon: "heart", note: "Hello" }]
              : [],
          error: null,
        }),
      };
      return builder;
    },
  }),
}));
import { publicWedding } from "@/server/services/weddings";
describe("public data boundary", () => {
  it("queries explicit public columns and never retrieves financial or guest fields", async () => {
    const result = await publicWedding("a-b");
    expect(result?.goals).toHaveLength(1);
    expect(selections).toEqual([
      "id,slug,partner1_name,partner2_name,wedding_date,photo_url,message",
      "id,title,icon,note",
    ]);
    const json = JSON.stringify(result);
    for (const privateKey of [
      "target_amount_paise",
      "guest_name",
      "amount_paise",
      "user_id",
      "published_at",
    ])
      expect(json).not.toContain(privateKey);
  });
});
