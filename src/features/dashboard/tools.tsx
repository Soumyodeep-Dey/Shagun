"use client";
import { useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
export function ShareTools({ url }: { url: string }) {
  const [message, setMessage] = useState("");
  const text = `We are getting married! Instead of gifts, bless us with Shagun towards our dreams 💛 ${url}`;
  return (
    <div className="stack">
      <div className="actions">
        <Button
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setMessage("Wedding link copied.");
            } catch {
              setMessage("Copy the link from the field below.");
            }
          }}
        >
          Copy public link
        </Button>
        <Button asChild variant="outline">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(text)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Share on WhatsApp
          </a>
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            try {
              const data = await QRCode.toDataURL(url, {
                width: 1024,
                margin: 3,
                color: { dark: "#7A1E2B", light: "#FFF8F0" },
              });
              const a = document.createElement("a");
              a.href = data;
              a.download = "shagun-wedding-qr.png";
              a.click();
            } catch {
              setMessage(
                "QR download unavailable. Please use the direct link.",
              );
            }
          }}
        >
          Download QR
        </Button>
      </div>
      <div>
        <label htmlFor="public-link">Your public wedding link</label>
        <input
          id="public-link"
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
        />
      </div>
      <p className="muted text-xs">
        WhatsApp opens a draft for you to review and send.
      </p>
      <p role="status" className="text-sm text-maroon">
        {message}
      </p>
    </div>
  );
}
export function ThankYouTool({
  id,
  text,
  thanked,
}: {
  id: string;
  text: string;
  thanked: boolean;
}) {
  const [done, setDone] = useState(thanked),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <details className="min-w-64">
      <summary className="cursor-pointer text-maroon">
        {done ? "Thanked ✓" : "Thank-you message"}
      </summary>
      <p className="text-sm whitespace-pre-wrap my-3">{text}</p>
      <div className="actions">
        <Button
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setMessage("Copied.");
            } catch {
              setMessage("Select and copy the message above.");
            }
          }}
        >
          Copy text
        </Button>
        <Button
          variant="ghost"
          disabled={busy || done}
          onClick={async () => {
            setBusy(true);
            try {
              const res = await fetch("/api/thanked", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error);
              setDone(true);
              setMessage("Marked as thanked.");
            } catch (e) {
              setMessage(e instanceof Error ? e.message : "Please retry.");
            } finally {
              setBusy(false);
            }
          }}
        >
          Mark as thanked
        </Button>
      </div>
      <p role="status" className="text-xs mt-2">
        {message}
      </p>
    </details>
  );
}
