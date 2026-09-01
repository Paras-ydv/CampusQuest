import Link from "next/link";
import { ThemeToggle } from "@/components/app/theme-toggle";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b-2 border-ink px-5 py-3.5">
        <div className="mx-auto flex max-w-[1400px] items-center">
          <Link href="/" className="k-display text-[0.95rem] tracking-[-0.045em]">
            Campus<span className="text-hot">Quest</span>
          </Link>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
