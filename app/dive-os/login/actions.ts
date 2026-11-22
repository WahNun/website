"use server";

import { AuthError, CredentialsSignin } from "next-auth";
import { signIn } from "@/auth";

export async function authenticate(
  _state: string | undefined,
  formData: FormData,
) {
  try {
    await signIn("credentials", formData);
  } catch (error) {
    if (error instanceof CredentialsSignin) {
      return "Those details were not recognised.";
    }
    if (error instanceof AuthError) {
      return "Sign-in did not complete. Try again.";
    }
    throw error;
  }
}

export async function signInWithGitHub() {
  await signIn("github", { redirectTo: "/dive-os" });
}
