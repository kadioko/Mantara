import Link from "next/link";
import { BellOff, CheckCheck } from "lucide-react";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { getLocale } from "@/lib/i18n/locale";
import { t } from "@/lib/i18n/messages";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/feedback";
import { markAllNotificationsRead, markNotificationRead } from "@/features/notifications/actions";

export const metadata = { title: "Notifications" };

/** Where each kind of notification should take the reader to act on it. */
/**
 * Where each kind of notification leads. An unmapped type still renders — it simply is not a link —
 * so a notification added by a later migration is never invisible to the person it was written for.
 */
const destinations: Record<string, string> = {
  "production.submitted": "/production",
  "expense.submitted": "/expenses",
  "compliance.licence_expiring": "/compliance",
  "compliance.task_overdue": "/compliance",
  "safety.action_overdue": "/safety",
};

export default async function NotificationsPage() {
  const workspace = await getActiveWorkspace();
  const locale = await getLocale();
  const { data } = await workspace.supabase
    .from("notifications")
    .select("id, type, title, body, read_at, created_at")
    .eq("user_id", workspace.user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const notifications = data ?? [];
  const unread = notifications.filter((notification) => !notification.read_at);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t(locale,"notifications")}
        description={unread.length ? `${unread.length} waiting for you.` : "Nothing needs your attention."}
        actions={unread.length > 0 ? (
          <form action={markAllNotificationsRead}>
            <Button variant="outline" size="sm"><CheckCheck aria-hidden />Mark all read</Button>
          </form>
        ) : undefined}
      />

      <Card>
        {notifications.length ? (
          <ul className="divide-y">
            {notifications.map((notification) => {
              const href = destinations[notification.type];
              const isUnread = !notification.read_at;
              return (
                <li key={notification.id} className={`flex flex-wrap items-start justify-between gap-3 p-5 ${isUnread ? "bg-secondary/40" : ""}`}>
                  <div className="min-w-0">
                    <p className="font-medium">
                      {href ? <Link href={href} className="text-primary hover:underline">{notification.title}</Link> : notification.title}
                      {isUnread && <Badge variant="warning" className="ml-2">New</Badge>}
                    </p>
                    {notification.body && <p className="mt-0.5 text-sm text-muted-foreground">{notification.body}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(notification.created_at).toISOString().replace("T", " ").slice(0, 16)}
                    </p>
                  </div>
                  {isUnread && (
                    <form action={markNotificationRead}>
                      <input name="notificationId" type="hidden" value={notification.id} />
                      <Button variant="ghost" size="sm">Mark read</Button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="p-5">
            <EmptyState
              icon={<BellOff className="size-6" aria-hidden />}
              title="No notifications"
              description={t(locale, "pToldHere")}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
