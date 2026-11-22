import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="content" className="not-found">
        <p className="kicker">404</p>
        <h1>This page is not on the site.</h1>
        <p className="lede">The public pages are Home, Dive Centres and Local Services.</p>
        <Link className="button" href="/">
          Back to the homepage
        </Link>
      </main>
      <SiteFooter />
    </>
  );
}
