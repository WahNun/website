"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DEFAULT_BRAND, loadCentreBrand, type CentreBrand } from "@/lib/centreBrand";

export function CentreChrome() {
 const [brand, setBrand] = useState<CentreBrand>(DEFAULT_BRAND);
 useEffect(() => {
 void loadCentreBrand().then(setBrand);
 }, []);

 return (
 <header style={{
 display: "flex",
 justifyContent: "space-between",
 gap: "16px",
 alignItems: "center",
 flexWrap: "wrap",
 padding: "18px 24px",
 borderBottom: "1px solid rgba(243,239,230,.16)",
 background: "rgba(9,9,9,.9)",
 }}>
 <Link href="/dive-os/book" style={{ display: "flex", alignItems: "center", gap: "12px", color: "#f3efe6", textDecoration: "none" }}>
 {brand.logoUrl ? (
 // eslint-disable-next-line @next/next/no-img-element
 <img src={brand.logoUrl} alt="" style={{ height: "36px", width: "auto" }} />
 ) : null}
 <span style={{ fontSize: "15px", letterSpacing: "-0.03em" }}>{brand.name}</span>
 </Link>
 <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", color: "#c9c2b6", fontSize: "14px" }}>
 {brand.phone ? <span>{brand.phone}</span> : null}
 {brand.email ? <a href={`mailto:${brand.email}`} style={{ color: "#f3efe6" }}>{brand.email}</a> : null}
 {brand.address ? <span>{brand.address}</span> : null}
 </div>
 </header>
 );
}

export function CentreIntro() {
 const [intro, setIntro] = useState(DEFAULT_BRAND.intro);
 useEffect(() => {
 void loadCentreBrand().then((brand) => setIntro(brand.intro));
 }, []);
 return <p style={{ maxWidth: "40rem", color: "#f3efe6", fontSize: "16px", lineHeight: 1.55 }}>{intro}</p>;
}
