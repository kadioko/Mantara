"use client";

import { useT } from "@/lib/i18n/client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/ui/form";
import { createClient } from "@/lib/supabase/client";
import { createDocumentUpload, finalizeDocumentUpload, type DocumentScope } from "./actions";

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const DOCUMENT_BUCKET = "documents";

export function DocumentUploadForm({ scope, ownerId }: { scope: DocumentScope; ownerId: string }) {
  const tr = useT();
  const formRef = useRef<HTMLFormElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = (form.elements.namedItem("file") as HTMLInputElement).files?.[0];
    if (!file) return setError("Choose a file to upload.");
    if (file.size > MAX_FILE_BYTES) return setError("Files must be 15 MB or smaller.");
    setUploading(true); setError(null); setMessage(null);
    const data = new FormData(form); data.set("fileName", file.name);
    const prepared = await createDocumentUpload({}, data);
    if (prepared.error || !prepared.path || !prepared.token) { setError(prepared.error ?? "Unable to prepare the upload."); setUploading(false); return; }
    const result = await createClient().storage.from(DOCUMENT_BUCKET).uploadToSignedUrl(prepared.path, prepared.token, file);
    if (result.error) { setError("The file could not be uploaded. Please try again."); setUploading(false); return; }
    data.set("path", prepared.path);
    const recorded = await finalizeDocumentUpload(data);
    if (recorded.error) { setError(recorded.error); setUploading(false); return; }
    setMessage(recorded.success ?? "Document attached."); form.reset(); setUploading(false); window.location.reload();
  }

  return <form ref={formRef} onSubmit={upload} className="grid gap-3 sm:grid-cols-2">
    <input type="hidden" name="scope" value={scope} /><input type="hidden" name="ownerId" value={ownerId} />
    <label className="text-sm font-semibold">{tr("uiDocumentName")}<input required name="documentName" maxLength={160} placeholder={tr("uiInsuranceCertificate")} className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("uiExpiryDate")}<input name="expiresOn" type="date" className={fieldClass} /></label>
    <label className="text-sm font-semibold sm:col-span-2">{tr("uiFile")}<input required name="file" type="file" className={fieldClass} onChange={(event)=>{const selected=event.currentTarget.files?.[0];setError(selected&&selected.size>MAX_FILE_BYTES?"Files must be 15 MB or smaller.":null)}} /></label>
    <input type="hidden" name="fileName" />
    <p className="text-xs text-muted-foreground sm:col-span-2">{tr("uiPrivateFileMaximumSize15MBUploadOnlyRecordsYou")}</p>
    {error&&<p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive sm:col-span-2">{error}</p>}
    {message&&<p role="status" className="rounded-lg bg-success/10 p-3 text-sm text-primary sm:col-span-2">{message}</p>}
    <div><Button disabled={uploading||Boolean(error)}>{uploading?"Uploading…":"Attach document"}</Button></div>
  </form>;
}
