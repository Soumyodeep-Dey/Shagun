import type { Metadata } from "next";
import Link from "next/link";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/playfair-display/400.css";
import "@fontsource/playfair-display/400-italic.css";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "Shagun — Your blessings, their new beginning",
    template: "%s · Shagun",
  },
  description:
    "A private wedding wishlist for your new beginning. Share dreams, receive blessings. No guest signup.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="sr-only focus:not-sr-only">
          Skip to content
        </a>
        <header className="shell">
          <nav className="nav" aria-label="Main navigation">
            <Link className="brand" href="/">
              shagun<span>✦</span>
            </Link>
            <div className="actions">
              <Link href="/dashboard" className="text-sm text-maroon">
                Couple dashboard
              </Link>
              <span className="mobile-hide text-sm muted">
                Made for new beginnings
              </span>
            </div>
          </nav>
        </header>
        <main id="main">{children}</main>
        <footer className="footer">
          <div className="shell flex flex-wrap justify-between gap-3">
            <span className="text-maroon font-serif text-lg">
              A little Shagun. A lifetime of love.
            </span>
            <span>Private by design · INR · Test payments only</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
