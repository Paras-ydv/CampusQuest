import { GenieDock } from "@/components/app/genie-dock";
import { TopNav } from "@/components/app/top-nav";
import { Marquee } from "@/components/motion/marquee";
import { getCurrentProfile, getSession } from "@/lib/auth/session";
import { TICKER_ITEMS } from "@/lib/data/fixtures";

/**
 * Everything behind the app shell is per-user and clock-sensitive — deadline
 * countdowns would otherwise be frozen at build time. Once the session is real
 * these pages are dynamic anyway; declaring it now keeps the rendered output
 * honest in the meantime.
 */
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [profile, session] = await Promise.all([getCurrentProfile(), getSession()]);
  // NOTE: getCurrentProfile still returns the demo fixture. Reading the real
  // row is GET /api/profile's job — the session below is already live.
  const signedIn = Boolean(session && !session.isMock);

  return (
    <div className="flex min-h-dvh flex-col">
      <TopNav
        initials={profile.initials}
        goalRole={profile.goalRole}
        signedIn={signedIn}
      />

      {/* Live campus data, always running. Doubles as the app's heartbeat. */}
      <div className="border-b-2 border-ink bg-hot text-on-hot">
        <Marquee
          duration={52}
          items={TICKER_ITEMS.map((t) => (
            <span
              key={t}
              className="font-mono text-[0.6875rem] tracking-[0.14em] uppercase"
            >
              {t}
            </span>
          ))}
        />
      </div>

      <main className="flex-1">{children}</main>

      {/* Genie on every screen behind the shell, with per-route suggestions. */}
      <GenieDock />

      <footer className="border-t-2 border-ink px-5 py-5">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-2">
          <span className="k-label">CampusQuest</span>
          <span className="font-mono text-[0.6875rem] text-faint">
            Alignment figures are historical, not a prediction of placement.
          </span>
        </div>
      </footer>
    </div>
  );
}
