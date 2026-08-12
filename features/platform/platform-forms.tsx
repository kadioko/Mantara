"use client";

import { useT } from "@/lib/i18n/client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { ShieldAlert, ShieldCheck, UserMinus, UserPlus } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { ActionFeedback } from "@/components/ui/feedback";
import {
  grantPlatformAdmin,
  revokePlatformAdmin,
  setOrganizationSuspended,
  type PlatformState,
} from "./actions";

export function SuspendOrganizationForm({ organizationId, organizationName, suspended }: { organizationId: string; organizationName: string; suspended: boolean }) {
  const tr = useT();
  const [state, action, pending] = useActionState(setOrganizationSuspended, {} as PlatformState);
  const [open, setOpen] = useState(false);

  if (suspended) {
    return <form action={action} className="flex flex-col gap-2">
      <input name="organizationId" type="hidden" value={organizationId} />
      <input name="suspend" type="hidden" value="false" />
      <Button disabled={pending} size="sm" variant="outline"><ShieldCheck aria-hidden />{pending ? "Restoring…" : "Restore"}</Button>
      <ActionFeedback state={state} />
    </form>;
  }

  if (!open) {
    return <Button size="sm" variant="outline" onClick={() => setOpen(true)}><ShieldAlert aria-hidden />{tr("uiSuspend")}</Button>;
  }

  return <form action={action} className="flex flex-col gap-2">
    <input name="organizationId" type="hidden" value={organizationId} />
    <input name="suspend" type="hidden" value="true" />
    <Label htmlFor={`reason-${organizationId}`} className="text-xs">
      Reason for suspending {organizationName}
    </Label>
    <Input id={`reason-${organizationId}`} name="reason" maxLength={300} required placeholder={tr("uiNonPaymentPendingReview")} className="h-9" />
    <div className="flex gap-2">
      <Button disabled={pending} size="sm" variant="destructive">{pending ? "Suspending…" : "Confirm"}</Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>{tr("cancel")}</Button>
    </div>
    <ActionFeedback state={state} />
  </form>;
}

export function GrantAdminForm() {
  const tr = useT();
  const [state, action, pending] = useActionState(grantPlatformAdmin, {} as PlatformState);
  return <form action={action} className="grid gap-3 sm:grid-cols-[2fr_2fr_auto] sm:items-end">
    <div>
      <Label htmlFor="admin-email">{tr("fEmailAddress")}</Label>
      <Input id="admin-email" name="email" type="email" required placeholder={tr("uiColleagueMantaraIo")} className="mt-1" />
    </div>
    <div>
      <Label htmlFor="admin-note">Note</Label>
      <Input id="admin-note" name="note" maxLength={200} placeholder={tr("uiSupportEngineer")} className="mt-1" />
    </div>
    <Button disabled={pending}><UserPlus aria-hidden />{pending ? "Granting…" : "Grant access"}</Button>
    <div className="sm:col-span-3"><ActionFeedback state={state} /></div>
  </form>;
}

export function RevokeAdminForm({ userId, isSelf }: { userId: string; isSelf: boolean }) {
  const [state, action, pending] = useActionState(revokePlatformAdmin, {} as PlatformState);
  return <form action={action} className="flex flex-col items-end gap-2">
    <input name="userId" type="hidden" value={userId} />
    <Button disabled={pending} size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10">
      <UserMinus aria-hidden />{pending ? "Revoking…" : isSelf ? "Revoke my access" : "Revoke"}
    </Button>
    <ActionFeedback state={state} />
  </form>;
}
