import Link from "next/link";
import { photoCredits } from "@/lib/photos";

const links = [
  { href: "/dive-centres", label: "Dive Centres" },
  { href: "/local-services", label: "Local Services" },
  { href: "/#projects", label: "Projects" },
  { href: "/#contact", label: "Contact" },
];

export function SiteFooter() {
  const credits = [...new Map(photoCredits.map((photo) => [photo.href, photo])).values()];
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="footer-row">
          <p>
            <strong>Lucas Wahnon</strong>
            <br />
            Web development and digital operations.
          </p>
          <nav className="footer-links" aria-label="Footer">
            {links.map((link) => (
              <Link key={link.href} href={link.href}>
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <details className="credits">
          <summary>Photography</summary>
          <ul>
            {credits.map((photo) => (
              <li key={photo.href}>
                {photo.alt} Photograph by {photo.credit}, {photo.license}.{" "}
                <a href={photo.href}>Source</a>
              </li>
            ))}
          </ul>
          <p>
            Replace any photograph by swapping the file in <code>public/images</code>.
            Product screens are demo views until real screenshots are added under{" "}
            <code>public/screenshots</code>.
          </p>
        </details>
        <p>© {new Date().getFullYear()} Lucas Wahnon</p>
      </div>
    </footer>
  );
}
