import React from "react";
import { createRoot } from "react-dom/client";
import { WeddingEditor } from "../../src/features/wedding/editor";
import { ShareTools, ThankYouTool } from "../../src/features/dashboard/tools";
import { thankYou } from "../../src/lib/utils";
const widget = new URLSearchParams(location.search).get("widget");
createRoot(document.getElementById("fixture")!).render(
  widget === "editor" ? (
    <WeddingEditor initial={null} />
  ) : (
    <div className="stack">
      <ShareTools url={`${location.origin}/w/fixture-couple`} />
      <ThankYouTool
        id="10000000-0000-4000-8000-000000000077"
        text={thankYou("Meera", "Aisha & Rahul", "First Home")}
        thanked={false}
      />
    </div>
  ),
);
