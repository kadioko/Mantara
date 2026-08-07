"use client";

import { useActionState } from "react";
import { t, type Locale } from "@/lib/i18n/messages";
import { recordAttendance, type WorkerState } from "./actions";

type WorkerOption = { id: string; full_name: string };

export function AttendanceForm({ locale, workers, today }: { locale: Locale; workers: WorkerOption[]; today: string }) {
  const [state, action, pending] = useActionState(recordAttendance, {} as WorkerState);
  return <form action={action} className="grid gap-4 rounded-xl border border-stone-200 bg-white p-5 shadow-sm md:grid-cols-2"><div className="md:col-span-2"><h2 className="text-lg font-bold">{t(locale, "markAttendance")}</h2></div><label className="text-sm font-semibold">{t(locale, "attendanceDate")}<input className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2" defaultValue={today} name="attendanceDate" required type="date" /></label><label className="text-sm font-semibold">{t(locale, "worker")}<select className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2" name="workerId" required><option value="">{t(locale, "worker")}</option>{workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.full_name}</option>)}</select></label><label className="text-sm font-semibold">{t(locale, "attendanceStatus")}<select className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2" defaultValue="present" name="status"><option value="present">{t(locale, "present")}</option><option value="absent">{t(locale, "absent")}</option><option value="late">{t(locale, "late")}</option><option value="leave">{t(locale, "leave")}</option></select></label><label className="text-sm font-semibold">{t(locale, "notes")}<input className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2" maxLength={1000} name="notes" /></label>{state.error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 md:col-span-2" role="alert">{state.error}</p>}{state.success && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 md:col-span-2" role="status">{state.success}</p>}<div className="md:col-span-2"><button className="rounded-lg bg-emerald-800 px-4 py-3 font-semibold text-white disabled:opacity-60" disabled={pending}>{pending ? t(locale, "recording") : t(locale, "recordAttendance")}</button></div></form>;
}
