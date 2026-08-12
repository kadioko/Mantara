"use client";

import { useT } from "@/lib/i18n/client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { selectClass } from "@/components/ui/form";
import { Ban, MapPin, RotateCcw, UserPlus, X } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { ActionFeedback } from "@/components/ui/feedback";
import {
  changeMemberRole,
  changeMemberSites,
  changeMemberStatus,
  inviteMember,
  revokeInvitation,
  type MemberState,
} from "./actions";
import { systemRoleCodes } from "./schemas";


export const roleLabels: Record<string, string> = {
  company_owner: "Company owner",
  mine_manager: "Mine manager",
  site_supervisor: "Site supervisor",
  accountant: "Accountant",
  storekeeper: "Storekeeper",
  maintenance_officer: "Maintenance officer",
  safety_officer: "Safety officer",
  viewer: "Viewer",
};

export function InviteMemberForm() {
  const tr = useT();
  const [state, action, pending] = useActionState(inviteMember, {} as MemberState);
  return <form action={action} className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
    <div>
      <Label htmlFor="invite-email">{tr("fEmailAddress")}</Label>
      <Input id="invite-email" name="email" type="email" required placeholder={tr("uiColleagueExampleCom")} className="mt-1" />
    </div>
    <div>
      <Label htmlFor="invite-role">Role</Label>
      <select id="invite-role" name="roleCode" defaultValue="site_supervisor" className={`${selectClass} mt-1 h-10 w-full`}>
        {systemRoleCodes.map((code) => <option key={code} value={code}>{roleLabels[code]}</option>)}
      </select>
    </div>
    <Button disabled={pending}><UserPlus aria-hidden />{pending ? "Inviting…" : "Send invitation"}</Button>
    <div className="sm:col-span-3"><ActionFeedback state={state} /></div>
  </form>;
}

export function MemberRoleForm({ userId, roleCode, isSelf, memberName }: { userId: string; roleCode: string; isSelf: boolean; memberName: string }) {
  const [state, action, pending] = useActionState(changeMemberRole, {} as MemberState);
  if (isSelf) {
    // The database refuses a self role change; saying so is clearer than a control that always fails.
    return <p className="text-sm text-muted-foreground">{roleLabels[roleCode] ?? roleCode}</p>;
  }
  return <form action={action} className="flex flex-wrap items-center gap-2">
    <input name="userId" type="hidden" value={userId} />
    <select name="roleCode" defaultValue={roleCode} aria-label={`Role for ${memberName}`} className={selectClass}>
      {systemRoleCodes.map((code) => <option key={code} value={code}>{roleLabels[code]}</option>)}
    </select>
    <Button disabled={pending} size="sm" variant="outline">{pending ? "Saving…" : "Change"}</Button>
    <div className="w-full"><ActionFeedback state={state} /></div>
  </form>;
}

export function MemberStatusForm({ userId, status, isSelf }: { userId: string; status: string; isSelf: boolean }) {
  const [state, action, pending] = useActionState(changeMemberStatus, {} as MemberState);
  if (isSelf) return null;
  const suspending = status === "active";
  return <form action={action} className="flex flex-col items-end gap-2">
    <input name="userId" type="hidden" value={userId} />
    <input name="status" type="hidden" value={suspending ? "suspended" : "active"} />
    <Button disabled={pending} size="sm" variant="ghost" className={suspending ? "text-destructive hover:bg-destructive/10" : ""}>
      {suspending ? <Ban aria-hidden /> : <RotateCcw aria-hidden />}
      {pending ? "Saving…" : suspending ? "Suspend" : "Restore"}
    </Button>
    <ActionFeedback state={state} />
  </form>;
}

export function RevokeInvitationForm({ invitationId }: { invitationId: string }) {
  const [state, action, pending] = useActionState(revokeInvitation, {} as MemberState);
  return <form action={action} className="flex flex-col items-end gap-2">
    <input name="invitationId" type="hidden" value={invitationId} />
    <Button disabled={pending} size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10">
      <X aria-hidden />{pending ? "Revoking…" : "Revoke"}
    </Button>
    <ActionFeedback state={state} />
  </form>;
}

export type SiteOption = { id: string; name: string };

/**
 * Chooses which mine sites a member may reach.
 *
 * Nothing ticked means every site. The wording says so out loud rather than leaving the reader to
 * infer it, because the opposite reading — nothing ticked meaning no access — would be a reasonable
 * guess and would make one careless save look like it had locked somebody out of the company.
 */
export function MemberSitesForm({
  userId,
  memberName,
  sites,
  selected,
  isSelf,
}: {
  userId: string;
  memberName: string;
  sites: SiteOption[];
  selected: string[];
  isSelf: boolean;
}) {
  const tr = useT();
  const [state, action, pending] = useActionState(changeMemberSites, {} as MemberState);
  const [open, setOpen] = useState(false);

  if (sites.length < 2) return null; // Nothing to choose between at a single-site company.

  const summary = selected.length === 0
    ? "All sites"
    : sites.filter((site) => selected.includes(site.id)).map((site) => site.name).join(", ");

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">{summary}</span>
        {!isSelf && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label={`Change site access for ${memberName}`}>
            <MapPin aria-hidden />Change
          </Button>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="w-full space-y-2 rounded-lg border border-border bg-secondary/30 p-3">
      <input name="userId" type="hidden" value={userId} />
      <fieldset>
        <legend className="text-sm font-medium">Mine sites {memberName} may reach</legend>
        <p className="mt-0.5 text-xs text-muted-foreground">{tr("uiTickNoneToAllowEverySiteIncludingSitesAddedLater")}</p>
        <div className="mt-2 space-y-1.5">
          {sites.map((site) => (
            <label key={site.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="siteIds" value={site.id} defaultChecked={selected.includes(site.id)} className="size-4 rounded border-input" />
              {site.name}
            </label>
          ))}
        </div>
      </fieldset>
      <ActionFeedback state={state} />
      <div className="flex gap-2">
        <Button disabled={pending} size="sm">{pending ? "Saving…" : "Save"}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>{tr("cancel")}</Button>
      </div>
    </form>
  );
}
