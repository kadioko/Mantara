import { AuthForm } from "@/features/auth/auth-form";

export default function RegisterPage() {
  return <section className="w-full rounded-2xl bg-white p-7 shadow-sm"><p className="text-sm font-bold tracking-widest text-amber-700">MANTARA</p><h1 className="mt-3 text-3xl font-bold">Create your account</h1><p className="mt-2 text-stone-600">Start setting up your organization.</p><AuthForm mode="register" /></section>;
}
