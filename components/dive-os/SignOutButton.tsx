import { signOut } from "@/auth";

export function SignOutButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/dive-os/login" });
      }}
    >
      <button className="button" type="submit">
        Sign out
      </button>
    </form>
  );
}
