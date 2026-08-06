export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <main className="mx-auto flex min-h-screen max-w-md items-center px-5 py-10">{children}</main>;
}
