import Link from "next/link";
import { clsx } from "clsx";
import { Counter } from "@/components/motion/counter";

/**
 * A single figure in the dashboard's right-hand column. Hovering inverts the
 * row and slides it sideways — the whole row is the affordance, so the target
 * is large and the motion is the only decoration it needs.
 */
export function StatRow({
  value,
  label,
  detail,
  href,
  suffix,
  delayMs,
}: {
  value: number;
  label: string;
  detail: string;
  href: string;
  suffix?: string;
  delayMs?: number;
}) {
  return (
    <Link
      href={href}
      className={clsx(
        "group flex items-baseline gap-4 border-b-2 border-ink px-6 py-5 last:border-b-0",
        "transition-[background-color,padding-left] duration-400 ease-[cubic-bezier(0.16,1,0.3,1)]",
        "hover:bg-ink hover:pl-9",
      )}
    >
      <span className="k-display min-w-[2.2ch] text-[2.4rem] text-ink transition-colors duration-300 group-hover:text-hot">
        <Counter value={value} suffix={suffix} delayMs={delayMs} />
      </span>
      <span className="font-mono text-[0.6875rem] tracking-[0.16em] text-muted uppercase transition-colors duration-300 group-hover:text-paper">
        {label}
      </span>
      <span className="ml-auto max-w-[17ch] text-right text-[0.78rem] leading-tight text-muted transition-colors duration-300 group-hover:text-paper/70">
        {detail}
      </span>
    </Link>
  );
}
