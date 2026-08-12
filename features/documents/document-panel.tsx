import { t } from "@/lib/i18n/messages";
import { getLocale } from "@/lib/i18n/locale";
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
export async function DocumentPanel({
  title,
  scope,
  documents,
}: {
  title: string;
  scope: DocumentScope;
  documents: StoredDocument[];
}) {
  const locale = await getLocale();
  if (!documentsEnabled()) return null;

  return (
    <Panel title={title} description={t(locale, "uiFilesAreHeldPrivatelyAndOpenedThroughShortLivedLinks")}>
      {documents.length ? (
        <DocumentList scope={scope} documents={documents} />
      ) : (
        <EmptyState
          icon={<FileText className="size-6" aria-hidden />}
          title={t(locale, "uiNoDocumentsAttached")}
          description={`Certificates and permits attached to this ${scope === "equipment" ? "asset" : "record"} appear here.`}
        />
      )}
    </Panel>
  );
}
