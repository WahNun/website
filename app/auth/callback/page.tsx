"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const code = new URLSearchParams(window.location.search).get("code");
    if (code) {
      supabase.auth
        .exchangeCodeForSession(code)
        .then(() => router.replace("/dive-os/my-profile?mode=recovery"))
        .catch(() => router.replace("/dive-os/login?error=auth"));
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        subscription.unsubscribe();
        router.replace("/dive-os/my-profile?mode=recovery");
      }
    });

    const hash = window.location.hash;
    if (!hash.includes("access_token")) {
      router.replace("/dive-os/login?error=auth");
    }

    return () => subscription.unsubscribe();
  }, [router]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,.5)", fontSize: "14px" }}>
      Authenticating…
    </div>
  );
}
