import { FileText } from "lucide-react";
import { documentsEnabled } from "@/lib/features";
import { Panel } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import type { DocumentScope } from "./actions";
import { DocumentList } from "./document-list";

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
        <DocumentList scope={scope} documents={documents} />
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
