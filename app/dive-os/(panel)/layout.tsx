import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OsNav } from "@/components/dive-os/OsNav";
import { SignOutButton } from "@/components/dive-os/SignOutButton";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  let session = null;
  try {
    session = await auth();
  } catch {
    redirect("/dive-os/login?error=Configuration");
  }
  if (session?.user?.role !== "admin") redirect("/dive-os/login");

  return (
    <div className="os">
      <header className="os-top">
        <div>
          <p className="kicker">Private</p>
          <strong>Dive OS</strong>
        </div>
        <SignOutButton />
      </header>
      <div className="os-body">
        <aside className="os-side">
          <OsNav />
          <p style={{ marginTop: "1.25rem" }}>
            <Link href="/">Public site</Link>
          </p>
        </aside>
        <div className="os-main">{children}</div>
      </div>
    </div>
  );
}
