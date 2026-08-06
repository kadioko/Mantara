"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, signUp, type AuthState } from "./actions";

const initialState: AuthState = {};

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const [state, action, pending] = useActionState(mode === "login" ? signIn : signUp, initialState);
  const isLogin = mode === "login";
  return (
    <form action={action} className="mt-8 space-y-5">
      <label className="block text-sm font-semibold">Email<input required name="email" type="email" autoComplete="email" className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-3" /></label>
      <label className="block text-sm font-semibold">Password<input required name="password" type="password" minLength={12} autoComplete={isLogin ? "current-password" : "new-password"} className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-3" /></label>
      {state.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}
      {state.message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{state.message}</p>}
      <button disabled={pending} className="w-full rounded-lg bg-emerald-800 px-4 py-3 font-semibold text-white disabled:opacity-60">{pending ? "Please wait…" : isLogin ? "Sign in" : "Create account"}</button>
      <p className="text-center text-sm text-stone-600">{isLogin ? "New to Mantara?" : "Already have an account?"} <Link className="font-semibold text-emerald-800" href={isLogin ? "/register" : "/login"}>{isLogin ? "Create an account" : "Sign in"}</Link></p>
    </form>
  );
}
