import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "@/components/dive-os/LoginForm";
import { adminStatus } from "@/lib/admin";

export const metadata: Metadata = {
  title: { absolute: "Sign in — Dive OS" },
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const status = adminStatus();
  if (status.secret) {
    try {
      const session = await auth();
      if (session?.user?.role === "admin") redirect("/dive-os");
    } catch {
      /* configuration problems are explained on this page */
    }
  }

  const params = await searchParams;
  const queryError = Array.isArray(params.error) ? params.error[0] : params.error;

  return (
    <main className="login">
      <p className="kicker">Private</p>
      <h1>Dive OS</h1>
      <p className="lede">
        Admin sign-in for dive centre software. This area is not part of the public
        site.
      </p>
      {!status.secret ? (
        <p className="field-error" role="status">
          AUTH_SECRET is not set, so sign-in is switched off. Add it in the Vercel
          project, then set either a password or GitHub allowlist. The README lists
          the variables.
        </p>
      ) : null}
      {status.secret && status.hashBroken ? (
        <p className="field-error" role="status">
          ADMIN_PASSWORD_HASH is set, but it is not a bcrypt hash. In a .env file,
          wrap the hash in single quotes so the dollar signs are kept. The Vercel
          dashboard stores the value as typed, without quotes.
        </p>
      ) : null}
      {status.secret && !status.anyProvider && !status.hashBroken ? (
        <p role="status">
          No sign-in method is configured. Set ADMIN_EMAIL and ADMIN_PASSWORD_HASH,
          or the GitHub allowlist variables. There is no default password.
        </p>
      ) : null}
      {status.secret && status.anyProvider ? (
        <LoginForm
          credentials={status.credentials}
          github={status.github}
          queryError={queryError}
        />
      ) : null}
      <p style={{ marginTop: "1.5rem" }}>
        <Link href="/">Back to the site</Link>
      </p>
    </main>
  );
}
