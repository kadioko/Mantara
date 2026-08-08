"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireScope } from "@/lib/auth/scope";

export type GeologyState = { error?: string; success?: string };
const coordinate = z.coerce.number();
const sampleSchema = z.object({ sampleCode: z.string().trim().min(2).max(80), sampleType: z.enum(["rock","soil","channel","chip","core","other"]), collectedOn: z.string().date(), latitude: coordinate.min(-90).max(90), longitude: coordinate.min(-180).max(180), material: z.string().trim().max(120).optional() });
const assaySchema = z.object({ sampleId: z.string().uuid(), analyte: z.string().trim().min(1).max(20), valuePpm: z.coerce.number().min(0), method: z.string().trim().max(120).optional(), laboratory: z.string().trim().max(160).optional(), testedOn: z.string().date().optional().or(z.literal("")) });
const drillSchema = z.object({ holeCode: z.string().trim().min(2).max(80), latitude: coordinate.min(-90).max(90), longitude: coordinate.min(-180).max(180), azimuth: z.coerce.number().min(0).max(360).optional(), dip: z.coerce.number().min(-90).max(90).optional(), plannedDepth: z.coerce.number().min(0).optional(), status: z.enum(["planned","drilling","completed","abandoned"]) });

async function insert(table: string, values: Record<string, unknown>) {
  const scope = await requireScope("geology.create", "You do not have permission to record geological data.");
  if ("error" in scope) return scope;
  const actor = scope.workspace.user.id;
  const { error } = await scope.workspace.supabase.from(table).insert({ organization_id: scope.organizationId, mine_site_id: scope.siteId, ...values, created_by: actor, updated_by: actor });
  if (error) return { error: error.code === "23505" ? "That code already exists in this organization." : "Unable to save the geological record." };
  revalidatePath("/geology"); return { success: "Geological record saved." };
}

export async function createSample(_: GeologyState, formData: FormData): Promise<GeologyState> {
  const parsed = sampleSchema.safeParse(Object.fromEntries(formData)); if (!parsed.success) return { error: "Check the sample code, date and coordinates." };
  const d = parsed.data; return insert("geological_samples", { sample_code:d.sampleCode, sample_type:d.sampleType, collected_on:d.collectedOn, latitude:d.latitude, longitude:d.longitude, material:d.material || null });
}
export async function createAssay(_: GeologyState, formData: FormData): Promise<GeologyState> {
  const parsed = assaySchema.safeParse(Object.fromEntries(formData)); if (!parsed.success) return { error: "Check the sample and assay result." };
  const scope = await requireScope("geology.create", "You do not have permission to record geological data."); if ("error" in scope) return scope;
  const { data: sample } = await scope.workspace.supabase.from("geological_samples").select("id").eq("id",parsed.data.sampleId).eq("organization_id",scope.organizationId).eq("mine_site_id",scope.siteId).maybeSingle();
  if (!sample) return { error: "That sample is outside the active site." };
  const d=parsed.data; return insert("geological_assays", { sample_id:d.sampleId, analyte:d.analyte, value_ppm:d.valuePpm, method:d.method||null, laboratory:d.laboratory||null, tested_on:d.testedOn||null });
}
export async function createDrillHole(_: GeologyState, formData: FormData): Promise<GeologyState> {
  const parsed = drillSchema.safeParse(Object.fromEntries(formData)); if (!parsed.success) return { error: "Check the drill-hole code, coordinates and orientation." };
  const d=parsed.data; return insert("drill_holes", { hole_code:d.holeCode, latitude:d.latitude, longitude:d.longitude, azimuth_degrees:d.azimuth??null, dip_degrees:d.dip??null, planned_depth_m:d.plannedDepth??null, status:d.status });
}

