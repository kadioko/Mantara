"use client";

import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

/** A full-width workspace is one click away. */
export function CollapsibleWorkspaceFrame({
  sidebar,
  leading,
  actions,
  mobileNavigation,
  collapseLabel,
  expandLabel,
  children,
}: {
  sidebar: React.ReactNode;
  leading: React.ReactNode;
  actions: React.ReactNode;
  mobileNavigation: React.ReactNode;
  collapseLabel: string;
  expandLabel: string;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  function toggleSidebar() {
    setCollapsed((wasCollapsed) => !wasCollapsed);
  }

  const toggleLabel = collapsed ? expandLabel : collapseLabel;

  return (
    <div className={`min-h-screen bg-background ${collapsed ? "" : "md:grid md:grid-cols-[17rem_minmax(0,1fr)]"}`}>
      {!collapsed && <aside className="hidden h-screen overflow-y-auto border-r border-emerald-900 bg-[linear-gradient(165deg,#022c22_0%,#064e3b_55%,#042f2e_100%)] p-5 text-white md:sticky md:top-0 md:block">{sidebar}</aside>}
      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-border/80 bg-background/90 px-5 py-3.5 backdrop-blur md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={toggleSidebar} aria-label={toggleLabel} title={toggleLabel}
              className="hidden size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition hover:border-primary/35 hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:inline-flex">
              {collapsed ? <PanelLeftOpen aria-hidden className="size-4" /> : <PanelLeftClose aria-hidden className="size-4" />}
            </button>
            {leading}
          </div>
          {actions}
        </header>
        {mobileNavigation}
        <main className="mx-auto max-w-7xl p-5 pb-10 md:p-8 md:pb-12">{children}</main>
      </div>
    </div>
  );
}
