import { ButtonLink } from "@/components/ui/button";
import { Label } from "@/components/ui/primitives";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-start justify-center px-5 py-20">
      <div className="mx-auto w-full max-w-[1400px]">
        <Label className="mb-4">Error 404</Label>
        <h1 className="k-display text-[clamp(3rem,14vw,10rem)]">
          Off the map.
        </h1>
        <p className="mt-6 max-w-[42ch] text-[0.95rem] leading-relaxed text-muted">
          That route doesn&apos;t exist. It may be one of the screens still
          scheduled for the next build pass.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <ButtonLink href="/journey" arrow>
            Your journey
          </ButtonLink>
          <ButtonLink href="/" variant="outline">
            Home
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
