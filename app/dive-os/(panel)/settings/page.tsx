import type { Metadata } from "next";
import { adminStatus } from "@/lib/admin";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  const status = adminStatus();
  return (
    <>
      <p className="kicker">Placeholder</p>
      <h1>Settings</h1>
      <p className="lede">
        Sign-in is read from environment variables on the server. Secrets, the
        password hash and the admin email are not shown here.
      </p>
      <ul className="status-list">
        <li>Credentials sign-in: {status.credentials ? "Configured" : "Not configured"}</li>
        <li>GitHub sign-in: {status.github ? "Configured" : "Not configured"}</li>
        <li>
          GitHub allowlist: {status.githubAllowlistCount}{" "}
          {status.githubAllowlistCount === 1 ? "username" : "usernames"}
        </li>
        <li>Session length: 12 hours</li>
      </ul>
      <p>
        Change these in the Vercel project wahnon-website. The README lists each
        variable.
      </p>
    </>
  );
}
