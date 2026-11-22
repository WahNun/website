"use client";

import { useActionState } from "react";
import { authenticate, signInWithGitHub } from "@/app/dive-os/login/actions";

const messages: Record<string, string> = {
  AccessDenied: "That account is not on the admin allowlist.",
  CredentialsSignin: "Those details were not recognised.",
  Configuration: "Sign-in is not configured yet. Add the environment variables in the project settings.",
};

export function LoginForm({
  credentials,
  github,
  queryError,
}: {
  credentials: boolean;
  github: boolean;
  queryError?: string;
}) {
  const [actionError, formAction, pending] = useActionState(authenticate, undefined);
  const message = actionError ?? (queryError ? messages[queryError] ?? messages.Configuration : undefined);

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      {message ? (
        <p className="field-error" role="alert">
          {message}
        </p>
      ) : null}
      {credentials ? (
        <form className="fields" action={formAction}>
          <input type="hidden" name="redirectTo" value="/dive-os" />
          <label>
            <span>Email</span>
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label>
            <span>Password</span>
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button className="button" type="submit" disabled={pending}>
            {pending ? "Signing in" : "Sign in"}
          </button>
        </form>
      ) : null}
      {github ? (
        <form action={signInWithGitHub}>
          <button className="button" type="submit">
            Continue with GitHub
          </button>
        </form>
      ) : null}
    </div>
  );
}
