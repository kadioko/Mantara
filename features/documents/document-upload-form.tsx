"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/ui/form";
import { createClient } from "@/lib/supabase/client";
import { createDocumentUpload, finalizeDocumentUpload, type DocumentScope, type DocumentUploadState } from "./actions";

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const DOCUMENT_BUCKET = "documents";

export function DocumentUploadForm({ scope, ownerId }: { scope: DocumentScope; ownerId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const uploadedPath = useRef<string | null>(null);
  const [state, action, pending] = useActionState(createDocumentUpload, {} as DocumentUploadState);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!state.uploadUrl || !state.path || !state.token || uploadedPath.current === state.path) return;
    const file = formRef.current?.elements.namedItem("file") as HTMLInputElement | null;
    if (!file?.files?.[0]) {
      setError("Choose the file again before uploading.");
      return;
    }
    uploadedPath.current = state.path;
    setUploading(true);
    setError(null);
    void (async () => {
      const result = await createClient().storage.from(DOCUMENT_BUCKET).uploadToSignedUrl(state.path!, state.token!, file.files![0]);
      if (result.error) {
        uploadedPath.current = null;
        setError("The file could not be uploaded. Please try again.");
        setUploading(false);
        return;
      }
      const data = new FormData(formRef.current!);
      data.set("path", state.path!);
      const recorded = await finalizeDocumentUpload(data);
      setUploading(false);
      if (recorded.error) setError(recorded.error);
      else {
        setMessage(recorded.success ?? "Document attached.");
        formRef.current?.reset();
        window.location.reload();
      }
    })();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="ownerId" value={ownerId} />
      <label className="text-sm font-semibold">Document name *
        <input required name="documentName" maxLength={160} placeholder="Insurance certificate" className={fieldClass} />
      </label>
      <label className="text-sm font-semibold">Expiry date
        <input name="expiresOn" type="date" className={fieldClass} />
      </label>
      <label className="text-sm font-semibold sm:col-span-2">File *
        <input required name="file" type="file" className={fieldClass} onChange={(event) => {
          const selected = event.currentTarget.files?.[0];
          const name = formRef.current?.elements.namedItem("fileName") as HTMLInputElement | null;
          if (name) name.value = selected?.name ?? "";
          setError(selected && selected.size > MAX_FILE_BYTES ? "Files must be 15 MB or smaller." : null);
        }} />
      </label>
      <input type="hidden" name="fileName" />
      <p className="text-xs text-muted-foreground sm:col-span-2">Private file; maximum size 15 MB. Upload only records you are allowed to share with this organization.</p>
      {(state.error || error) && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive sm:col-span-2">{error ?? state.error}</p>}
      {message && <p role="status" className="rounded-lg bg-success/10 p-3 text-sm text-primary sm:col-span-2">{message}</p>}
      <div><Button disabled={pending || uploading || Boolean(error)}>{pending || uploading ? "Uploading…" : "Attach document"}</Button></div>
    </form>
  );
}
