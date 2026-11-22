"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

function LoginForm() {
 const router = useRouter();
 const params = useSearchParams();
 const [email, setEmail] = useState("");
 const [password, setPassword] = useState("");
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState<string | null>(
 params.get("error") === "forbidden" ? "This area is for admin accounts only." : null,
 );

 async function handleLogin() {
 if (!email || !password) {
 setError("Enter your email and password.");
 return;
 }
 setLoading(true);
 setError(null);
 const supabase = createClient();
 const { data, error: signError } = await supabase.auth.signInWithPassword({ email, password });
 if (signError || !data.user) {
 setLoading(false);
 setError(
 signError?.message === "Invalid login credentials"
 ? "Incorrect email or password."
 : signError?.message ?? "Sign-in failed.",
 );
 return;
 }
 const { data: profile } = await supabase
 .from("profiles")
 .select("role")
 .eq("id", data.user.id)
 .maybeSingle();
 if (profile?.role !== "admin") {
 await supabase.auth.signOut();
 setLoading(false);
 setError("This area is for admin accounts only.");
 return;
 }
 router.replace("/dive-os/overview");
 router.refresh();
 }

 const field = {
 width: "100%",
 padding: "12px 14px",
 borderRadius: 0,
 fontSize: "15px",
 background: "rgba(255,255,255,.06)",
 border: "1px solid rgba(255,255,255,.12)",
 color: "#fff",
 fontFamily: "inherit",
 outline: "none",
 boxSizing: "border-box" as const,
 };

 return (
 <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
 <div style={{ width: "100%", maxWidth: "400px" }}>
 <div style={{ textAlign: "center", marginBottom: "40px" }}>
 <div style={{ fontSize: "13px", fontWeight: 500, letterSpacing: ".08em", textTransform: "uppercase", color: "#f3efe6", marginBottom: "10px" }}>
 Dive OS
 </div>
 <h1 style={{ fontSize: "28px", fontWeight: 500, margin: 0, letterSpacing: "-.02em" }}>Admin</h1>
 <p style={{ color: "rgba(243,239,230,0.55)", fontSize: "14px", marginTop: "8px" }}>
 Sign in with an admin account
 </p>
 </div>
 <form
 onSubmit={(event) => {
 event.preventDefault();
 void handleLogin();
 }}
 style={{ display: "flex", flexDirection: "column", gap: "14px", padding: "28px 24px", background: "linear-gradient(180deg, rgba(255,255,255,.08) 0%, rgba(255,255,255,.052) 42%, rgba(255,255,255,.03) 100%)", border: "1px solid rgba(255,255,255,.12)" }}
 >
 <input type="email" autoComplete="username" placeholder="Email address" value={email} onChange={(event) => setEmail(event.target.value)} style={field} />
 <input type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} style={field} />
 {error ? (
 <div role="alert" style={{ background: "rgba(201,146,140,.1)", border: "1px solid rgba(201,146,140,.28)", borderRadius: 0, padding: "12px 14px", fontSize: "14px", color: "#c9928c", lineHeight: 1.45 }}>
 {error}
 </div>
 ) : null}
 <button type="submit" disabled={loading} style={{ width: "100%", padding: "14px", borderRadius: 0, border: "1px solid #f3efe6", background: loading ? "transparent" : "#f3efe6", color: "#000", fontWeight: 500, letterSpacing: ".08em", textTransform: "uppercase", fontSize: "13px", cursor: loading ? "default" : "pointer", fontFamily: "inherit", marginTop: "6px" }}>
 {loading ? "Signing in…" : "Sign in"}
 </button>
 </form>
 </div>
 </main>
 );
}

export default function LoginPage() {
 return (
 <Suspense fallback={null}>
 <LoginForm />
 </Suspense>
 );
}
