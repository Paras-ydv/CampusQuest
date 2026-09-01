"use client";

import Link from "next/link";
import { motion, useScroll, useTransform } from "motion/react";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { ButtonLink } from "@/components/ui/button";

export function LandingNav() {
  const { scrollYProgress } = useScroll();
  // A hairline that fills across the top as the page is read.
  const scaleX = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <header className="sticky top-0 z-50 border-b-2 border-ink bg-paper/85 backdrop-blur-md">
      <motion.div
        style={{ scaleX }}
        className="absolute inset-x-0 bottom-[-2px] h-[2px] origin-left bg-hot"
      />
      <div className="mx-auto flex max-w-[1400px] items-center gap-5 px-5 py-3.5">
        <Link href="/" className="k-display text-[0.95rem] tracking-[-0.045em]">
          Campus<span className="text-hot">Quest</span>
        </Link>
        <span className="ml-auto" />
        <ThemeToggle />
        <ButtonLink href="/sign-in" size="sm" variant="outline">
          Sign in
        </ButtonLink>
      </div>
    </header>
  );
}
