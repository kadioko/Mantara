import { getActiveWorkspace } from "@/lib/auth/workspace";
import { getLocale } from "@/lib/i18n/locale";
import { t } from "@/lib/i18n/messages";

export default async function DashboardPage() {
  const [workspace, locale] = await Promise.all([getActiveWorkspace(), getLocale()]);
  return <section><p className="text-sm font-semibold tracking-wider text-amber-700">MANTARA OS</p><h1 className="mt-2 text-3xl font-bold">{workspace.activeOrganization?.name ?? "Mantara"}</h1><p className="mt-3 max-w-2xl text-stone-600">{workspace.activeSite ? `${t(locale, "currentMineSite")}: ${workspace.activeSite.name}. ` : ""}{t(locale, "workspaceReady")}</p><div className="mt-8 rounded-xl border border-dashed border-stone-300 bg-white p-6"><h2 className="font-bold">{t(locale, "workspaceShell")}</h2><p className="mt-2 text-sm text-stone-600">{t(locale, "workspaceShellDescription")}</p></div></section>;
}
