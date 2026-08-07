import Image from "next/image";

type LogoTone = "light" | "dark";

export function MantaraLogo({ tone = "light", compact = false }: { tone?: LogoTone; compact?: boolean }) {
  const wordmarkClass = tone === "dark" ? "text-white" : "text-emerald-950";
  return <div className="flex items-center gap-2.5"><Image alt="Mantara" className="h-9 w-9 shrink-0 object-contain" height={72} priority src="/brand/mantara-mark.png" width={72} />{!compact && <span className={`text-xl font-black tracking-tight ${wordmarkClass}`}>Mantara</span>}</div>;
}
