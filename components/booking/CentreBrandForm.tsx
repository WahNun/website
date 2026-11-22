"use client";

import { useEffect, useState } from "react";
import { supabase, s } from "@/components/pages/_shared";
import { BRAND_KEYS, DEFAULT_BRAND, loadCentreBrand, type CentreBrand } from "@/lib/centreBrand";

const FIELDS: { key: keyof CentreBrand; label: string; setting: string }[] = [
 { key: "name", label: "Dive centre name", setting: BRAND_KEYS.name },
 { key: "logoUrl", label: "Logo URL", setting: BRAND_KEYS.logoUrl },
 { key: "email", label: "Email", setting: BRAND_KEYS.email },
 { key: "phone", label: "Phone", setting: BRAND_KEYS.phone },
 { key: "address", label: "Address", setting: BRAND_KEYS.address },
 { key: "intro", label: "Intro text", setting: BRAND_KEYS.intro },
];

export function CentreBrandForm() {
 const [form, setForm] = useState<CentreBrand>(DEFAULT_BRAND);
 const [msg, setMsg] = useState<string | null>(null);
 const [saving, setSaving] = useState(false);

 useEffect(() => {
 void loadCentreBrand().then(setForm);
 }, []);

 async function save() {
 setSaving(true);
 setMsg(null);
 const token = (await supabase.auth.getSession()).data.session?.access_token ?? "";
 const errors: string[] = [];
 for (const field of FIELDS) {
 const response = await fetch("/api/site-settings", {
 method: "POST",
 headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
 body: JSON.stringify({ key: field.setting, value: form[field.key] }),
 });
 if (!response.ok) {
 const body = await response.json().catch(() => ({}));
 errors.push(body.error ?? `Could not save ${field.label}`);
 }
 }
 setSaving(false);
 setMsg(errors.length ? errors[0] : "Saved. The booking page reads these fields.");
 }

 const input = {
 width: "100%",
 boxSizing: "border-box" as const,
 background: "transparent",
 color: s.text,
 border: "1px solid rgba(243,239,230,.45)",
 padding: "10px 12px",
 fontFamily: s.font,
 fontSize: "14px",
 };

 return (
 <section style={{ marginBottom: "28px", borderTop: "1px solid rgba(243,239,230,.16)", paddingTop: "18px" }}>
 <h3 style={{ margin: "0 0 8px", fontSize: "13px", letterSpacing: ".14em", textTransform: "uppercase", fontWeight: 500, color: s.muted }}>
 Booking page
 </h3>
 <p style={{ margin: "0 0 14px", color: s.muted, fontSize: "14px", maxWidth: "40rem" }}>
 Name, logo, contact details and the intro on the customer booking page. Nothing here is tied to a particular dive centre.
 </p>
 <div style={{ display: "grid", gap: "10px", maxWidth: "36rem" }}>
 {FIELDS.map((field) => (
 <label key={field.key} style={{ display: "grid", gap: "4px", fontSize: "13px", color: s.muted }}>
 {field.label}
 {field.key === "intro" ? (
 <textarea value={form.intro} onChange={(event) => setForm((current) => ({ ...current, intro: event.target.value }))} rows={3} style={input} />
 ) : (
 <input value={form[field.key]} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))} style={input} />
 )}
 </label>
 ))}
 <button type="button" className="button" disabled={saving} onClick={() => void save()} style={{ justifySelf: "start" }}>
 {saving ? "Saving" : "Save booking page"}
 </button>
 {msg ? <p style={{ margin: 0, color: s.text, fontSize: "13px" }}>{msg}</p> : null}
 </div>
 </section>
 );
}
