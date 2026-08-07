"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Boxes,
  ClipboardCheck,
  Drill,
  Factory,
  Fuel,
  HardHat,
  LayoutDashboard,
  Package,
  ReceiptText,
  ShieldCheck,
  UsersRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";

type NavItem = { href: string; label: string };

const icons: Record<string, LucideIcon> = {
  "/dashboard": LayoutDashboard,
  "/workers": UsersRound,
  "/attendance": ClipboardCheck,
  "/equipment": Drill,
  "/shifts": BarChart3,
  "/production": Factory,
  "/fuel": Fuel,
  "/maintenance": Wrench,
  "/inventory": Package,
  "/expenses": ReceiptText,
  "/compliance": ShieldCheck,
  "/safety": HardHat,
  "/admin": Boxes,
};

export function NavigationLinks({ items, mobile = false }: { items: NavItem[]; mobile?: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main navigation" className={mobile ? "grid grid-cols-2 gap-2" : "space-y-1"}>
      {items.map((item) => {
        const Icon = icons[item.href] ?? Boxes;
        const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
        const desktopClass = active
          ? "border-emerald-300/35 bg-emerald-800/90 text-white shadow-sm"
          : "border-transparent text-emerald-50/80 hover:border-emerald-700 hover:bg-emerald-900/80 hover:text-white";
        const mobileClass = active
          ? "border-emerald-800 bg-emerald-900 text-white"
          : "border-stone-200 bg-white text-stone-700 hover:border-emerald-300 hover:bg-emerald-50";
        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 ${mobile ? `justify-center ${mobileClass}` : desktopClass}`}>
            <Icon aria-hidden className="size-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
