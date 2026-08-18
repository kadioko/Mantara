"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";

type DraftScope = { userId: string; organizationId: string; siteId: string };
const DraftScopeContext = createContext<DraftScope | null>(null);

export function OfflineDraftProvider({ scope, children }: { scope: DraftScope; children: React.ReactNode }) {
  return <DraftScopeContext.Provider value={scope}>{children}</DraftScopeContext.Provider>;
}

const DATABASE_NAME = "mantara-offline";

/** How long a draft is worth keeping. Long enough to survive a weekend, short enough to expire. */
export const DRAFT_TTL_DAYS = 7;

/**
 * Which stored drafts are past keeping.
 *
 * Pure, and separated from the storage so it can be tested — IndexedDB does not exist in the test
 * environment, and the decision of what to throw away is the part worth being sure about.
 */
export function staleDraftIds(
  rows: Array<{ id: string; updatedAt?: string }>,
  now = new Date(),
  ttlDays = DRAFT_TTL_DAYS,
): string[] {
  const cutoff = now.getTime() - ttlDays * 24 * 60 * 60 * 1000;
  return rows
    .filter((row) => {
      const at = Date.parse(row.updatedAt ?? "");
      // A row with no readable timestamp predates this field or was written by something else.
      // Dropping it is right: it can never be shown to expire, so keeping it means keeping it forever.
      return Number.isNaN(at) || at < cutoff;
    })
    .map((row) => row.id);
}

/**
 * Removes every offline draft and the key that decrypts them.
 *
 * Called on sign-out. Until this existed nothing ever removed either, so a shift plan, an attendance
 * roster and a safety inspection stayed on the device indefinitely — and a mine-site machine is
 * usually shared. The drafts are encrypted and keyed per user, so the next person could not read
 * them; that is not a reason to leave a previous user's work sitting on a shared computer.
 *
 * The whole database goes rather than the rows, which takes the key with it. Ciphertext without its
 * key is not recoverable, so this holds even if a stray row survived somewhere.
 *
 * Never throws. Sign-out must complete whatever the browser does about storage.
 */
export async function clearOfflineDrafts(): Promise<void> {
  try {
    if (typeof indexedDB === "undefined") return;
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(DATABASE_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      // Fires when another tab still holds the database open. Sign-out cannot wait on that tab, and
      // the delete completes once it closes.
      request.onblocked = () => resolve();
    });
  } catch {
    // Storage being unavailable is not a reason to keep somebody signed in.
  }
}

function request<T>(value: IDBRequest<T>) { return new Promise<T>((resolve, reject) => { value.onsuccess=()=>resolve(value.result); value.onerror=()=>reject(value.error); }); }
async function database(){const opened=indexedDB.open(DATABASE_NAME,1);opened.onupgradeneeded=()=>{const db=opened.result;if(!db.objectStoreNames.contains("drafts"))db.createObjectStore("drafts");if(!db.objectStoreNames.contains("keys"))db.createObjectStore("keys")};return request(opened)}
async function keyFor(db:IDBDatabase,userId:string){const old=await request(db.transaction("keys").objectStore("keys").get(userId)) as CryptoKey|undefined;if(old)return old;const key=await crypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);await new Promise<void>((resolve,reject)=>{const tx=db.transaction("keys","readwrite");tx.objectStore("keys").put(key,userId);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)});return key}
const encoder=new TextEncoder(),decoder=new TextDecoder();
async function save(id:string,userId:string,values:Record<string,string>){const db=await database();const key=await keyFor(db,userId);const iv=crypto.getRandomValues(new Uint8Array(12));const cipher=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,encoder.encode(JSON.stringify(values)));await new Promise<void>((resolve,reject)=>{const tx=db.transaction("drafts","readwrite");tx.objectStore("drafts").put({iv:[...iv],cipher,updatedAt:new Date().toISOString()},id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)});db.close()}
async function load(id:string,userId:string){const db=await database();const row=await request(db.transaction("drafts").objectStore("drafts").get(id)) as {iv:number[];cipher:ArrayBuffer}|undefined;if(!row){db.close();return null}try{const key=await keyFor(db,userId);const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:new Uint8Array(row.iv)},key,row.cipher);return JSON.parse(decoder.decode(plain)) as Record<string,string>}finally{db.close()}}
async function remove(id:string){const db=await database();await new Promise<void>((resolve,reject)=>{const tx=db.transaction("drafts","readwrite");tx.objectStore("drafts").delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)});db.close()}
function values(form:HTMLFormElement){const result:Record<string,string>={};for(const [name,value] of new FormData(form))if(typeof value==="string"&&name&&!name.toLowerCase().includes("password"))result[name]=value;return result}

/** Persists encrypted, user/tenant/site-bound drafts for low-conflict forms. */
export function useEncryptedDraft(formRef:React.RefObject<HTMLFormElement|null>,formKey:string,saved:boolean){const scope=useContext(DraftScopeContext);const [status,setStatus]=useState<"idle"|"restored"|"saved">("idle");const timer=useRef<ReturnType<typeof setTimeout>|null>(null);const id=scope?`${scope.userId}:${scope.organizationId}:${scope.siteId}:${formKey}`:"";
  useEffect(()=>{if(!scope||!formRef.current)return;const form=formRef.current;void load(id,scope.userId).then(record=>{if(!record)return;for(const [name,value] of Object.entries(record)){const field=form.elements.namedItem(name);if(field instanceof HTMLInputElement||field instanceof HTMLTextAreaElement||field instanceof HTMLSelectElement)field.value=value}setStatus("restored")}).catch(()=>undefined);const changed=()=>{if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>{void save(id,scope.userId,values(form)).then(()=>setStatus("saved")).catch(()=>undefined)},500)};form.addEventListener("input",changed);form.addEventListener("change",changed);return()=>{form.removeEventListener("input",changed);form.removeEventListener("change",changed);if(timer.current)clearTimeout(timer.current)}},[formRef,id,scope]);
  useEffect(()=>{if(saved&&id)void remove(id).then(()=>setStatus("idle")).catch(()=>undefined)},[saved,id]);return status}
