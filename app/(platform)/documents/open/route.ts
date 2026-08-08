import { NextRequest, NextResponse } from "next/server";
import { getDocumentUrl, type DocumentScope } from "@/features/documents/actions";

const documentScopes = ["equipment", "compliance", "training", "geology"] as const;

export async function GET(request: NextRequest) {
  const scope = request.nextUrl.searchParams.get("scope");
  const path = request.nextUrl.searchParams.get("path");
  if (!scope || !path || !documentScopes.includes(scope as (typeof documentScopes)[number])) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  const url = await getDocumentUrl(scope as DocumentScope, path);
  return NextResponse.redirect(url ?? new URL("/dashboard", request.url));
}
