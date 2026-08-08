"use client";

import { useState } from "react";
import { ExternalLink, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getDocumentUrl, type DocumentScope } from "./actions";
import type { StoredDocument } from "./document-panel";

export function DocumentList({ scope, documents }: { scope: DocumentScope; documents: StoredDocument[] }) {
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!documents.length) return null;
  return <>
    <ul className="divide-y">
      {documents.map((document) => <li key={document.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
        <span className="flex items-center gap-2 font-medium"><FileText className="size-4 text-muted-foreground" aria-hidden />{document.document_name}</span>
        <span className="flex items-center gap-3 text-sm text-muted-foreground">
          {document.expires_on ? `Expires ${document.expires_on}` : "No expiry recorded"}
          <Button variant="outline" size="sm" disabled={opening === document.id} onClick={async () => {
            setOpening(document.id); setError(null);
            const url = await getDocumentUrl(scope, document.document_path);
            setOpening(null);
            if (!url) { setError("This document could not be opened. Please refresh and try again."); return; }
            window.location.assign(url);
          }}>{opening === document.id ? "Opening…" : <><ExternalLink aria-hidden /> Open</>}</Button>
        </span>
      </li>)}
    </ul>
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
  </>;
}
