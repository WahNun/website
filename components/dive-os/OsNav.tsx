"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/dive-os", label: "Overview" },
  { href: "/dive-os/releases", label: "Releases" },
  { href: "/dive-os/customers", label: "Customers" },
  { href: "/dive-os/settings", label: "Settings" },
];

export function OsNav() {
  const pathname = usePathname();
  return (
    <nav className="os-nav" aria-label="Dive OS">
      {items.map((item) => {
        const active =
          item.href === "/dive-os"
            ? pathname === "/dive-os"
            : pathname.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
