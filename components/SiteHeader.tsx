"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const links = [
  { href: "/dive-centres", label: "Dive Centres" },
  { href: "/local-services", label: "Local Services" },
  { href: "/#projects", label: "Projects" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt === pathname;

  useEffect(() => {
    document.body.classList.toggle("nav-open", open);
    return () => document.body.classList.remove("nav-open");
  }, [open]);

  return (
    <header className="site-header">
      <a className="skip" href="#content">
        Skip to content
      </a>
      <Link href="/" className="wordmark">
        Lucas Wahnon
      </Link>
      <div className="header-tools">
      <button
        type="button"
        className="menu-button"
        aria-expanded={open}
        aria-controls="site-nav"
        onClick={() => setOpenedAt(open ? null : pathname)}
      >
        {open ? "Close" : "Menu"}
      </button>
      <nav
        id="site-nav"
        className={open ? "site-nav is-open" : "site-nav"}
        aria-label="Primary"
      >
        {links.map((link) => {
          const active =
            (link.href === "/dive-centres" &&
              pathname.startsWith("/dive-centres")) ||
            (link.href === "/local-services" &&
              pathname.startsWith("/local-services"));
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              onClick={() => setOpenedAt(null)}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
      <Link href="/#contact" className="button button--solid" onClick={() => setOpenedAt(null)}>
        Contact
      </Link>
      </div>
    </header>
  );
}
