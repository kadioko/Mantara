"use client";

import { useActionState, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionFeedback } from "@/components/ui/feedback";
import { setRolePermissions, type RoleState } from "./actions";

export type PermissionOption = { code: string; name: string; description: string };

/**
 * The submitted set replaces the role's grant outright, since an unchecked box sends nothing. Group
 * headings follow the permission code's domain so a long flat list stays navigable.
 */
export function RolePermissionsForm({
  roleCode,
  roleName,
  granted,
  permissions,
}: {
  roleCode: string;
  roleName: string;
  granted: string[];
  permissions: PermissionOption[];
}) {
  const [state, action, pending] = useActionState(setRolePermissions, {} as RoleState);
  const [open, setOpen] = useState(false);
  const grantedSet = new Set(granted);

  if (!open) {
    return <Button variant="outline" size="sm" onClick={() => setOpen(true)}><ShieldCheck aria-hidden />Edit permissions</Button>;
  }

  const groups = new Map<string, PermissionOption[]>();
  for (const permission of permissions) {
    const domain = permission.code.split(".")[0];
    groups.set(domain, [...(groups.get(domain) ?? []), permission]);
  }

  return (
    <form action={action} className="w-full space-y-4">
      <input name="roleCode" type="hidden" value={roleCode} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...groups.entries()].map(([domain, options]) => (
          <fieldset key={domain} className="rounded-lg border p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {domain.replace("_", " ")}
            </legend>
            <div className="space-y-1.5">
              {options.map((permission) => (
                <label key={permission.code} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="permissions"
                    value={permission.code}
                    defaultChecked={grantedSet.has(permission.code)}
                    className="mt-0.5 size-4 shrink-0"
                  />
                  <span title={permission.description}>{permission.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      <ActionFeedback state={state} />
      <div className="flex gap-2">
        <Button disabled={pending}>{pending ? "Saving…" : `Save ${roleName}`}</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}
