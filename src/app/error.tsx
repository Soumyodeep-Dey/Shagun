"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="shell page">
      <div className="card stack">
        <h1 className="text-4xl">A little pause</h1>
        <p>
          We couldn’t load this page. If you’re setting up Shagun, check your
          server environment and database migrations.
        </p>
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
