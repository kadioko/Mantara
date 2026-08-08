"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { documentsEnabled } from "@/lib/features";
import { requireScope, rowInScope, rowInScopeHard } from "@/lib/auth/scope";
import { rateLimitMessage, withinRateLimit } from "@/lib/auth/rate-limit";

export type DocumentState = { error?: string; success?: string };

export const documentScopes = ["equipment", "compliance", "training"] as const;
export type DocumentScope = (typeof documentScopes)[number];

const BUCKET = "documents";

/** Which permission and table each kind of document belongs to. */
const scopeConfig: Record<DocumentScope, { permission: string; table: string; siteScoped: boolean; softDeleted: boolean }> = {
  equipment: { permission: "equipment.update", table: "equipment", siteScoped: true, softDeleted: true },
  compliance: { permission: "compliance.update", table: "mineral_licences", siteScoped: false, softDeleted: true },
  training: { permission: "worker.update", table: "workers", siteScoped: true, softDeleted: true },
};

const uploadSchema = z.object({
  scope: z.enum(documentScopes),
  ownerId: z.string().uuid(),
  documentName: z.string().trim().min(2, "Name the document.").max(160),
  fileName: z.string().trim().min(1).max(200),
  expiresOn: z.string().date().optional().or(z.literal("")),
});

/**
 * Strips anything that could climb out of the owning folder or confuse the storage key. The object
 * path decides who may read a file, so it must never be attacker-shaped.
 */
function safeFileName(name: string) {
  const cleaned = name.replace(/[^A-Za-z0-9._-]/g, "-").replace(/^[.-]+/, "").slice(-120);
  return cleaned || "document";
}

/**
 * Prepares a private upload and records the resulting path.
 *
 * Storage is off until DOCUMENTS_ENABLED is set, so this refuses rather than half-working. Both the
 * bucket policies and this action check the same permission; the policies are what actually enforce
 * it, since a signed URL is issued by the database, not by us.
 */
export async function createDocumentUpload(_: DocumentState, formData: FormData): Promise<DocumentState & { uploadUrl?: string; path?: string; token?: string }> {
  if (!documentsEnabled()) return { error: "Document storage is not switched on yet." };

  const parsed = uploadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the document details." };
  const config = scopeConfig[parsed.data.scope];

  const scope = await requireScope(config.permission, "You do not have permission to attach documents here.");
  if ("error" in scope) return scope;

  // After the permission check, so a caller who is not allowed to attach anything cannot spend
  // somebody else's allowance by asking. Each call mints a signed upload URL and a storage path,
  // which is a real object created in the bucket whether or not the upload that follows completes —
  // the one place in the product where a loop costs storage rather than rows.
  if (!await withinRateLimit("document.upload")) return { error: await rateLimitMessage("document.upload") };

  const owned = config.softDeleted
    ? await rowInScope(scope, config.table, parsed.data.ownerId, { siteScoped: config.siteScoped })
    : await rowInScopeHard(scope, config.table, parsed.data.ownerId, { siteScoped: config.siteScoped });
  if (!owned) return { error: "That record does not belong to the active workspace." };

  // The first segment is the organization; the storage policies read it to decide access.
  const path = `${scope.organizationId}/${parsed.data.scope}/${parsed.data.ownerId}/${Date.now()}-${safeFileName(parsed.data.fileName)}`;
  const { data, error } = await scope.workspace.supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: "Unable to prepare the upload. Please try again." };

  const actor = scope.workspace.user.id;
  if (parsed.data.scope === "equipment") {
    const { error: insertError } = await scope.workspace.supabase.from("equipment_documents").insert({
      organization_id: scope.organizationId,
      equipment_id: parsed.data.ownerId,
      document_name: parsed.data.documentName,
      document_path: path,
      created_by: actor,
      updated_by: actor,
    });
    if (insertError) return { error: "Unable to record the document. Please try again." };
  } else if (parsed.data.scope === "compliance") {
    const { error: insertError } = await scope.workspace.supabase.from("compliance_documents").insert({
      organization_id: scope.organizationId,
      licence_id: parsed.data.ownerId,
      document_name: parsed.data.documentName,
      document_path: path,
      expires_on: parsed.data.expiresOn || null,
      created_by: actor,
      updated_by: actor,
    });
    if (insertError) return { error: "Unable to record the document. Please try again." };
  } else {
    const { error: updateError } = await scope.workspace.supabase
      .from("training_records").update({ certificate_path: path, updated_by: scope.workspace.user.id })
      .eq("id", parsed.data.ownerId).eq("organization_id", scope.organizationId);
    if (updateError) return { error: "Unable to record the certificate. Please try again." };
  }

  revalidatePath(`/${parsed.data.scope === "compliance" ? "compliance" : "equipment"}`);
  return { success: "Document recorded.", uploadUrl: data.signedUrl, path, token: data.token };
}

/** Issues a short-lived link. Reading is authorised by the bucket policy, not by this function. */
export async function getDocumentUrl(scope: DocumentScope, path: string): Promise<string | null> {
  if (!documentsEnabled()) return null;
  const config = scopeConfig[scope];
  const active = await requireScope(config.permission.replace(".update", ".read"), "Not permitted.");
  if ("error" in active) return null;
  // A path outside the caller's organization is refused before the request is even made.
  if (!path.startsWith(`${active.organizationId}/`)) return null;

  const { data } = await active.workspace.supabase.storage.from(BUCKET).createSignedUrl(path, 60);
  return data?.signedUrl ?? null;
}
