import Link from "next/link";
import {
  ArrowRight,
  Heart,
  Plane,
  Home,
  LockKeyhole,
  Link2,
  Gift,
} from "lucide-react";
import { Button } from "@/components/ui/button";
export default function Landing() {
  return (
    <div className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow mb-6">For the life you’ll build together</p>
          <h1 className="mb-7">
            Your blessings,
            <br />
            their new <em>beginning.</em>
          </h1>
          <p className="muted text-lg max-w-lg mb-8">
            Some gifts become memories. Others become a first home, a faraway
            adventure, a dream come true.
          </p>
          <p className="muted max-w-md mb-8">
            Create a private wedding wishlist. Let your loved ones give Shagun,
            with a blessing that stays with you.
          </p>
          <div className="actions">
            <Button asChild>
              <Link href="/create">
                Create Your Wishlist <ArrowRight size={16} />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/w/aisha-rahul">Meet our demo couple</Link>
            </Button>
          </div>
          <p className="text-xs muted mt-5 flex items-center gap-2">
            <LockKeyhole size={13} /> No guest signup. No public gift amounts.
          </p>
        </div>
        <div
          className="hero-art"
          role="img"
          aria-label="Decorative wedding invitation with intertwined hearts"
        >
          <span className="flower">❋</span>
          <div className="arch">
            <div className="wedding-symbol">
              ♡
              <div className="text-3xl mt-5 font-serif">
                a little love,
                <br />
                <em>a new beginning</em>
              </div>
            </div>
          </div>
          <div className="hero-note text-sm tracking-widest">
            WITH LOVE, ALWAYS
          </div>
        </div>
      </section>
      <div className="divider">
        <span>✦</span>
      </div>
      <section className="section">
        <div className="text-center mb-12">
          <p className="eyebrow mb-3">Beautifully simple</p>
          <h2>Three steps. So much love.</h2>
        </div>
        <div className="grid grid-3">
          {[
            {
              icon: Heart,
              title: "Create your page",
              copy: "Your story, your wedding, and the dreams you’re making room for.",
            },
            {
              icon: Link2,
              title: "Share your link",
              copy: "Send it your way: a direct link, a QR code, or a WhatsApp message.",
            },
            {
              icon: Gift,
              title: "Receive Shagun & blessings",
              copy: "Loved ones choose an envelope and leave a little love. No account needed.",
            },
          ].map((s, i) => (
            <article className="card" key={s.title}>
              <div className="flex justify-between mb-8">
                <s.icon className="text-maroon" />
                <span className="eyebrow">0{i + 1}</span>
              </div>
              <h3 className="mb-3">{s.title}</h3>
              <p className="muted">{s.copy}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="section border-t border-[#e7d9c9]">
        <div className="flex flex-wrap items-end justify-between gap-5 mb-10">
          <div>
            <p className="eyebrow mb-3">A wishlist for what matters</p>
            <h2>Dream a little, together.</h2>
          </div>
          <p className="muted max-w-sm">
            A few ideas for your next chapter.
            <br />
            Your dreams. Always your choice.
          </p>
        </div>
        <div className="grid grid-3">
          {[
            {
              icon: Plane,
              title: "A honeymoon adventure",
              copy: "New places. Just the two of you.",
            },
            {
              icon: Home,
              title: "Your first home",
              copy: "The beginning of a thousand little moments.",
            },
            {
              icon: Heart,
              title: "For your new beginning",
              copy: "A little love for wherever life takes you.",
            },
          ].map((d) => (
            <article key={d.title} className="card">
              <div className="dream-icon">
                <d.icon />
              </div>
              <h3 className="mb-3">{d.title}</h3>
              <p className="muted">{d.copy}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="card text-center mb-20 py-14">
        <p className="eyebrow mb-4">Just between you and your loved ones</p>
        <h2 className="mb-5">
          The love is shared.
          <br />
          The details stay private.
        </h2>
        <p className="muted max-w-xl mx-auto mb-7">
          Gift amounts, blessings, guest details, and dream targets are visible
          only to the couple. Your guests simply open your link and give from
          the heart.
        </p>
        <Button asChild>
          <Link href="/create">
            Begin your story <ArrowRight size={16} />
          </Link>
        </Button>
      </section>
    </div>
  );
}
