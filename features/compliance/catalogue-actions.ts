"use server";

import { revalidatePath } from "next/cache";
import { requireScope, rowInScope, rpcMessage } from "@/lib/auth/scope";
import { licenceEditSchema, requirementEditSchema, requirementStatusSchema } from "./schemas";
import type { ComplianceState } from "./actions";

/**
 * Corrections to the compliance catalogue — the last one in the product that could only be created.
 *
 * A licence number typed wrong, or an expiry date a month out, matters more here than anywhere else
 * in Mantara: the expiry drives the "expiring within 30 days" warning, and a wrong one means either
 * a false alarm every day or, worse, silence right up to the day the licence lapses.
 *
 * Note the two different permissions. Licences are gated on `compliance.update`; requirements on
 * `compliance.create`, because that is what their existing policy checks. Matching the policy rather
 * than picking the tidier-sounding name is the point — a mismatch would deny everyone silently, and
 * tests/unit/permission-codes.test.ts only catches codes that do not exist at all, not ones that
 * exist but guard a different table.
 */

export async function updateLicence(_: ComplianceState, formData: FormData): Promise<ComplianceState> {
  const parsed = licenceEditSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the licence details." };
  const scope = await requireScope("compliance.update", "You do not have permission to update compliance records.");
  if ("error" in scope) return scope;
  if (!await rowInScope(scope, "mineral_licences", parsed.data.id, { siteScoped: false })) {
    return { error: "That licence is not in this organization." };
  }

  const { error } = await scope.workspace.supabase
    .from("mineral_licences")
    .update({
      licence_number: parsed.data.licenceNumber,
      licence_type: parsed.data.licenceType,
      issuing_authority: parsed.data.issuingAuthority || null,
      holder_name: parsed.data.holderName || null,
      issued_on: parsed.data.issuedOn || null,
      expires_on: parsed.data.expiresOn || null,
      status: parsed.data.status,
      // A licence held against one site stays with that site; moving it is a different decision
      // from correcting it, so the edit form does not offer to change the scope.
      notes: parsed.data.notes || null,
      updated_by: scope.workspace.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.id)
    .eq("organization_id", scope.organizationId);
  if (error) {
    return { error: error.code === "23505" ? "Another licence already uses that number." : rpcMessage(error, "Unable to save the licence. Please try again.") };
  }
  revalidatePath("/compliance");
  return { success: "Licence updated." };
}

export async function updateRequirement(_: ComplianceState, formData: FormData): Promise<ComplianceState> {
  const parsed = requirementEditSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the requirement details." };
  const scope = await requireScope("compliance.create", "You do not have permission to manage compliance requirements.");
  if ("error" in scope) return scope;

  const { error } = await scope.workspace.supabase
    .from("compliance_requirements")
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
      category: parsed.data.category || null,
      recurrence: parsed.data.recurrence,
      updated_by: scope.workspace.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.id)
    .eq("organization_id", scope.organizationId);
  if (error) {
    return { error: error.code === "23505" ? "Another requirement already uses that name." : rpcMessage(error, "Unable to save the requirement. Please try again.") };
  }
  revalidatePath("/compliance");
  return { success: "Requirement updated." };
}

export async function setRequirementStatus(_: ComplianceState, formData: FormData): Promise<ComplianceState> {
  const parsed = requirementStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Check the requirement and try again." };
  const scope = await requireScope("compliance.create", "You do not have permission to manage compliance requirements.");
  if ("error" in scope) return scope;

  const { error } = await scope.workspace.supabase
    .from("compliance_requirements")
    .update({ is_active: parsed.data.isActive, updated_by: scope.workspace.user.id, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .eq("organization_id", scope.organizationId);
  if (error) return { error: rpcMessage(error, "Unable to change the requirement. Please try again.") };
  revalidatePath("/compliance");
  return {
    success: parsed.data.isActive
      ? "Requirement reinstated. Completing its tasks will schedule the next one again."
      : "Requirement retired. Tasks already open stay open, but no new ones will be scheduled.",
  };
}
