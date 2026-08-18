import Image from "next/image";

type LogoTone = "light" | "dark";
const brandName = "Mantara";

/**
 * The Mantara mark and wordmark.
 *
 * Two things here were wrong and both made the logo hard to read.
 *
 * The mark was `mantara-mark.png`, a 1254px square whose artwork occupies only the middle 52% —
 * roughly a quarter of the canvas is empty on every side. Drawn with `object-contain` in a 36px box
 * that left about 19px of actual mark beside a 20px wordmark, which reads as a smudge rather than a
 * logo. `mantara-mark-tight.png` is the same artwork cropped to fill 88% of its canvas. The padded
 * original stays for the web manifest, where a maskable icon genuinely needs that safe zone.
 *
 * The wordmark was `text-emerald-950` — a fixed near-black. On the dark card the workspace uses in
 * dark mode that is close to invisible, which is the other half of "I cannot see it". `text-primary`
 * is the same brand green and is defined per theme, so it stays legible in both.
 */
export function MantaraLogo({
  tone = "light",
  compact = false,
  size = 40,
}: {
  tone?: LogoTone;
  compact?: boolean;
  /** Pixel size of the mark. The wordmark scales with it. */
  size?: number;
}) {
  const wordmarkClass = tone === "dark" ? "text-white" : "text-primary";
  return (
    <div className="flex items-center gap-2.5">
      <Image
        alt={brandName}
        className="shrink-0 object-contain"
        height={size}
        width={size}
        priority
        src="/brand/mantara-mark-tight.png"
      />
      {!compact && (
        <span
          className={`font-black tracking-tight ${wordmarkClass}`}
          style={{ fontSize: Math.round(size * 0.55) }}
        >
          {brandName}
        </span>
      )}
    </div>
  );
}
