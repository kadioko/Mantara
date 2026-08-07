"use client";

import Link from "next/link";
import { useActionState } from "react";
import { t, type Locale } from "@/lib/i18n/messages";
import { signIn, signUp, type AuthState } from "./actions";

const initialState: AuthState = {};

export function AuthForm({ mode, locale }: { mode: "login" | "register"; locale: Locale }) {
  const [state, action, pending] = useActionState(mode === "login" ? signIn : signUp, initialState);
  const isLogin = mode === "login";
  return <form action={action} className="mt-8 space-y-5"><label className="block text-sm font-semibold">{t(locale, "email")}<input required name="email" type="email" autoComplete="email" className="mt-2 w-full rounded-lg border border-input bg-card px-3 py-3" /></label><label className="block text-sm font-semibold">{t(locale, "password")}<input required name="password" type="password" minLength={12} autoComplete={isLogin ? "current-password" : "new-password"} className="mt-2 w-full rounded-lg border border-input bg-card px-3 py-3" /></label>{state.error && <p role="alert" className="rounded-lg bg-destructive/12 p-3 text-sm text-destructive">{state.error}</p>}{state.message && <p role="status" className="rounded-lg bg-success/12 p-3 text-sm text-primary">{state.message}</p>}<button disabled={pending} className="w-full rounded-lg bg-primary px-4 py-3 font-semibold text-white disabled:opacity-60">{pending ? t(locale, "pleaseWait") : isLogin ? t(locale, "signIn") : t(locale, "createAccount")}</button><p className="text-center text-sm text-muted-foreground">{isLogin ? t(locale, "newToMantara") : t(locale, "alreadyHaveAccount")} <Link className="font-semibold text-primary" href={isLogin ? "/register" : "/login"}>{isLogin ? t(locale, "createAccount") : t(locale, "signIn")}</Link></p></form>;
}
