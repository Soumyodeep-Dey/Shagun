"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { weddingSchema, type WeddingInput } from "@/lib/validation/schemas";
import type { OwnerWedding, PublicWedding } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { WeddingView } from "./view";
const welcome =
  "Your presence is our greatest gift. If you’d like to give Shagun, you can leave a blessing and contribute towards our new beginning.";
export function WeddingEditor({ initial }: { initial: OwnerWedding | null }) {
  const router = useRouter();
  const [preview, setPreview] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const form = useForm<WeddingInput>({
    resolver: zodResolver(weddingSchema),
    defaultValues: initial
      ? {
          partner1_name: initial.partner1_name,
          partner2_name: initial.partner2_name,
          wedding_date: initial.wedding_date,
          slug: initial.slug,
          photo_url: initial.photo_url || "",
          message: initial.message,
          publish: !!initial.published_at,
          goals: initial.goals
            .filter((g) => g.is_active)
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((g) => ({
              id: g.id,
              title: g.title,
              target_amount_paise: g.target_amount_paise,
              icon: g.icon,
              note: g.note,
            })),
        }
      : {
          partner1_name: "",
          partner2_name: "",
          wedding_date: "",
          slug: "",
          photo_url: "",
          message: welcome,
          goals: [],
          publish: false,
        },
  });
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "goals",
    keyName: "fieldKey",
  });
  async function save(publish: boolean) {
    form.setValue("publish", publish);
    await form.handleSubmit(async (values) => {
      setBusy(true);
      setMessage("");
      try {
        const res = await fetch("/api/wedding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        router.push("/dashboard");
        router.refresh();
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Unable to save.");
      } finally {
        setBusy(false);
      }
    })();
  }
  const input = (
    key: "partner1_name" | "partner2_name" | "wedding_date" | "slug",
    label: string,
    type = "text",
  ) => (
    <div className="field">
      <label htmlFor={key}>{label}</label>
      <input
        id={key}
        type={type}
        {...form.register(key)}
        aria-invalid={!!form.formState.errors[key]}
      />
      {form.formState.errors[key] && (
        <p className="text-sm text-maroon" role="alert">
          {form.formState.errors[key]?.message}
        </p>
      )}
    </div>
  );
  return (
    <div className="stack">
      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
      {preview ? (
        <>
          <div className="notice">
            Private preview. This page is not published by previewing.
          </div>
          <WeddingView
            wedding={
              {
                ...form.getValues(),
                id: initial?.id || "preview",
                photo_url: form.getValues("photo_url") || null,
                goals: form
                  .getValues("goals")
                  .map((g, i) => ({ ...g, id: g.id || `preview-${i}` })),
              } as PublicWedding
            }
            preview
          />
          <Button variant="outline" onClick={() => setPreview(false)}>
            Back to editing
          </Button>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save(false);
          }}
        >
          <section className="card mb-6">
            <h2 className="text-3xl mb-6">The two of you</h2>
            <div className="grid grid-2">
              {input("partner1_name", "First partner’s name")}
              {input("partner2_name", "Second partner’s name")}
              {input("wedding_date", "Wedding date", "date")}
              {input("slug", "Your unique link · /w/your-names")}
            </div>
            <div className="field">
              <label htmlFor="photo">Couple photo (optional)</label>
              <input
                id="photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 5242880) {
                    setMessage("Photo must be under 5 MB.");
                    return;
                  }
                  setBusy(true);
                  try {
                    const fd = new FormData();
                    fd.set("photo", file);
                    const res = await fetch("/api/upload", {
                      method: "POST",
                      body: fd,
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error);
                    form.setValue("photo_url", data.url);
                    setMessage("Photo uploaded. Save your page to keep it.");
                  } catch (e) {
                    setMessage(
                      e instanceof Error ? e.message : "Upload failed.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              />
              <p className="muted text-xs mt-2">
                JPEG, PNG or WebP · up to 5 MB. Published photos are public.
              </p>
              {form.watch("photo_url") && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => form.setValue("photo_url", "")}
                >
                  Remove photo from page
                </Button>
              )}
            </div>
            <div>
              <label htmlFor="message">Your welcome message</label>
              <textarea
                id="message"
                maxLength={1500}
                {...form.register("message")}
              />
            </div>
          </section>
          <section className="card mb-6">
            <h2 className="text-3xl mb-3">Dream a little</h2>
            <p className="muted mb-6">
              Add up to three dreams. Targets stay private. General Shagun is
              always available.
            </p>
            <div className="stack">
              {fields.map((field, i) => (
                <fieldset
                  className="border border-[#e4d6c5] rounded-xl p-5"
                  key={field.fieldKey}
                >
                  <legend>Dream {i + 1}</legend>
                  <div className="grid grid-2">
                    <div className="field">
                      <label htmlFor={`title-${i}`}>Title</label>
                      <input
                        id={`title-${i}`}
                        {...form.register(`goals.${i}.title`)}
                        maxLength={100}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`target-${i}`}>Private target (₹)</label>
                      <Controller
                        control={form.control}
                        name={`goals.${i}.target_amount_paise`}
                        render={({ field: f }) => (
                          <input
                            id={`target-${i}`}
                            type="number"
                            min="1"
                            step="1"
                            value={f.value / 100 || ""}
                            onChange={(e) =>
                              f.onChange(
                                Math.round(Number(e.target.value) * 100),
                              )
                            }
                          />
                        )}
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor={`icon-${i}`}>Icon</label>
                    <select
                      id={`icon-${i}`}
                      {...form.register(`goals.${i}.icon`)}
                    >
                      <option value="heart">Heart</option>
                      <option value="plane">Travel</option>
                      <option value="home">Home</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor={`note-${i}`}>A little note</label>
                    <textarea
                      id={`note-${i}`}
                      {...form.register(`goals.${i}.note`)}
                      maxLength={400}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => remove(i)}
                  >
                    Archive / remove dream
                  </Button>
                </fieldset>
              ))}
            </div>
            {fields.length < 3 && (
              <Button
                className="mt-5"
                type="button"
                variant="outline"
                onClick={() =>
                  append({
                    title: "",
                    target_amount_paise: 100000,
                    icon: "heart",
                    note: "",
                  })
                }
              >
                + Add a dream
              </Button>
            )}
          </section>
          {Object.keys(form.formState.errors).length > 0 && (
            <p role="alert" className="error mb-5">
              Please check your names, wedding date, link and dream details.
              Every dream needs a title and positive target.
            </p>
          )}
          <div className="actions">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => form.handleSubmit(() => setPreview(true))()}
            >
              Preview
            </Button>
            <Button variant="outline" disabled={busy} type="submit">
              Save as draft
            </Button>
            <Button disabled={busy} type="button" onClick={() => save(true)}>
              {busy ? "Saving…" : "Publish wedding page"}
            </Button>
          </div>
          <p className="muted text-sm mt-4">
            Saving as draft takes your wedding page off the public link.
            Existing gift records are preserved.
          </p>
        </form>
      )}
    </div>
  );
}
