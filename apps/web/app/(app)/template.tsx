import { PageTransition } from "@/components/motion/page-transition";

/**
 * Next re-mounts `template.tsx` on every navigation inside this group, which is
 * what gives each route a fresh entrance animation.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
