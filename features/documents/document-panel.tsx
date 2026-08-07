import { FileText } from "lucide-react";
import { documentsEnabled } from "@/lib/features";
import { Panel } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import type { DocumentScope } from "./actions";

export type StoredDocument = { id: string; document_name: string; document_path: string; expires_on?: string | null };

/**
 * Renders attached documents. While document storage is switched off this returns nothing at all,
 * rather than an upload control that would fail — an operator should not be offered something the
 * system cannot yet do.
 */
export function DocumentPanel({
  title,
  scope,
  documents,
}: {
  title: string;
  scope: DocumentScope;
  documents: StoredDocument[];
}) {
  if (!documentsEnabled()) return null;

  return (
    <Panel title={title} description="Files are held privately and opened through short-lived links.">
      {documents.length ? (
        <ul className="divide-y">
          {documents.map((document) => (
            <li key={document.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <span className="flex items-center gap-2 font-medium">
                <FileText className="size-4 text-muted-foreground" aria-hidden />
                {document.document_name}
              </span>
              <span className="text-sm text-muted-foreground">
                {document.expires_on ? `Expires ${document.expires_on}` : "No expiry recorded"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<FileText className="size-6" aria-hidden />}
          title="No documents attached"
          description={`Certificates and permits attached to this ${scope === "equipment" ? "asset" : "record"} appear here.`}
        />
      )}
    </Panel>
  );
}
