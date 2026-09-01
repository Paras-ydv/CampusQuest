"use client";

import { clsx } from "clsx";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "outline" | "hot" | "ghost";
type Size = "sm" | "md" | "lg";

const base =
  "group relative inline-flex items-center justify-center gap-3 overflow-hidden font-mono uppercase tracking-[0.13em] font-bold " +
  "transition-[color,border-color] duration-300 disabled:pointer-events-none disabled:opacity-40 select-none";

const sizes: Record<Size, string> = {
  sm: "px-4 py-2 text-[0.6875rem]",
  md: "px-6 py-3.5 text-xs",
  lg: "px-8 py-4.5 text-sm",
};

const variants: Record<Variant, { shell: string; fill: string; text: string }> =
  {
    // Ink block that floods vermilion on hover.
    primary: {
      shell: "border-2 border-ink bg-ink",
      fill: "bg-hot",
      text: "text-paper group-hover:text-on-hot",
    },
    // Outline that floods ink.
    outline: {
      shell: "border-2 border-ink bg-transparent",
      fill: "bg-ink",
      text: "text-ink group-hover:text-paper",
    },
    // Vermilion block that floods ink.
    hot: {
      shell: "border-2 border-hot bg-hot",
      fill: "bg-ink",
      text: "text-on-hot group-hover:text-paper",
    },
    ghost: {
      shell: "border-2 border-transparent bg-transparent",
      fill: "bg-sunk",
      text: "text-muted group-hover:text-ink",
    },
  };

type CommonProps = {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  className?: string;
  /** Renders a chevron that slides forward on hover. */
  arrow?: boolean;
};

function Inner({
  children,
  variant = "primary",
  arrow,
}: Pick<CommonProps, "children" | "variant" | "arrow">) {
  const v = variants[variant];
  return (
    <>
      {/* The wipe. Rises from below to fill the button on hover. */}
      <span
        aria-hidden
        className={clsx(
          "absolute inset-0 translate-y-full transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-y-0",
          v.fill,
        )}
      />
      <span className={clsx("relative z-10 transition-colors duration-300", v.text)}>
        {children}
      </span>
      {arrow ? (
        <span
          aria-hidden
          className={clsx(
            "relative z-10 transition-[transform,color] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-1.5",
            v.text,
          )}
        >
          →
        </span>
      ) : null}
    </>
  );
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  className,
  arrow,
  ...rest
}: CommonProps & ComponentProps<"button">) {
  return (
    <button
      className={clsx(base, sizes[size], variants[variant].shell, className)}
      {...rest}
    >
      <Inner variant={variant} arrow={arrow}>
        {children}
      </Inner>
    </button>
  );
}

export function ButtonLink({
  children,
  variant = "primary",
  size = "md",
  className,
  arrow,
  href,
  ...rest
}: CommonProps & ComponentProps<typeof Link>) {
  return (
    <Link
      href={href}
      className={clsx(base, sizes[size], variants[variant].shell, className)}
      {...rest}
    >
      <Inner variant={variant} arrow={arrow}>
        {children}
      </Inner>
    </Link>
  );
}
