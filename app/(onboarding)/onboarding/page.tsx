import { redirect } from "next/navigation";
import { currentMembership } from "@/lib/auth/context";
import { OnboardingForm } from "@/features/organizations/onboarding-form";

export default async function OnboardingPage() {
  const { membership } = await currentMembership();
  if (membership) redirect("/dashboard");
  return <main className="mx-auto flex min-h-screen max-w-md items-center px-5 py-10"><section className="w-full rounded-2xl bg-white p-7 shadow-sm"><p className="text-sm font-bold tracking-widest text-amber-700">MANTARA</p><h1 className="mt-3 text-3xl font-bold">Set up your workspace</h1><p className="mt-2 text-stone-600">Create your company and first mine site. You can add more sites later.</p><OnboardingForm /></section></main>;
}
