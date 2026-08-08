import { ExternalLink, FileText } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import type { DocumentScope } from "./actions";
import type { StoredDocument } from "./document-panel";

export function DocumentList({ scope, documents }: { scope: DocumentScope; documents: StoredDocument[] }) {
  if (!documents.length) return null;
  return <ul className="divide-y">
    {documents.map((document) => {
      const query = new URLSearchParams({ scope, path: document.document_path });
      return <li key={document.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
        <span className="flex items-center gap-2 font-medium"><FileText className="size-4 text-muted-foreground" aria-hidden />{document.document_name}</span>
        <span className="flex items-center gap-3 text-sm text-muted-foreground">
          {document.expires_on ? `Expires ${document.expires_on}` : "No expiry recorded"}
          <a className={buttonVariants({ variant: "outline", size: "sm" })} href={`/documents/open?${query}`}><ExternalLink aria-hidden /> Open</a>
        </span>
      </li>;
    })}
  </ul>;
}
