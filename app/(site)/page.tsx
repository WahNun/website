import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ContactForm } from "@/components/ContactForm";
import { PhotoBand } from "@/components/PhotoBand";
import { photos } from "@/lib/photos";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: `${site.title} — ${site.name}` },
  description: site.description,
  alternates: { canonical: "/" },
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string | string[]; intent?: string | string[] }>;
}) {
  const params = await searchParams;
  const sent = Array.isArray(params.sent) ? params.sent[0] : params.sent;
  const intent = Array.isArray(params.intent) ? params.intent[0] : params.intent;

  return (
    <>
      <section className="hero">
        <div className="hero__media">
          <Image
            src={photos.heroSea.src}
            alt={photos.heroSea.alt}
            fill
            priority
            sizes="100vw"
            className="cover cover--sea"
          />
        </div>
        <div className="hero__scrim" />
        <div className="hero__content">
          <h1>Websites built for bookings and enquiries.</h1>
          <p className="lede">
            I design and build websites and the systems behind them. I help dive
            centres manage bookings and daily operations, and local service businesses
            get found and make it easier for customers to book or request a quote.
          </p>
          <div className="hero__actions">
            <Link className="button" href="/dive-centres">
              For Dive Centres
            </Link>
            <Link className="button" href="/local-services">
              For Local Service Businesses
            </Link>
          </div>
        </div>
      </section>

      <PhotoBand
        photo={photos.diveHarbour}
        imageClass="cover cover--harbour"
        kicker="01"
        title="Dive Centre Websites & Operations"
        text="Online and front desk bookings, live boat occupancy, digital check-in, staff planning and course management."
        href="/dive-centres"
        action="For Dive Centres"
      />
      <PhotoBand
        photo={photos.localWorkshop}
        imageClass="cover cover--workshop"
        kicker="02"
        title="Websites & Local Growth"
        text="Websites, booking and quote tools, local SEO and AI search visibility."
        href="/local-services"
        action="For Local Service Businesses"
      />

      <section id="projects" className="wrap">
        <p className="kicker">Selected work</p>
        <h2>Projects</h2>
        <article className="project">
          <p className="pill">Delivered</p>
          <div>
            <h3>Azores Diving</h3>
            <p>
              A website for a dive centre in the Azores: pages for dives, trips and
              courses, and a booking path that follows how the boats actually run.
              Delivered as a working site for the centre.
            </p>
            <p>
              The operations screens on the dive centres page are demo views with
              sample data, so the day-to-day tools can be shown before a centre’s own
              screenshots are available. They are not a capture of the Azores Diving
              admin.
            </p>
            <p>
              <Link href="/dive-centres#dashboard">See the operations dashboard</Link>
            </p>
          </div>
        </article>
        <article className="project">
          <p className="pill">Proposal demo</p>
          <div>
            <h3>FabriCare</h3>
            <p>
              A proposal for a fabric and upholstery cleaning business. The demo
              follows a customer choosing upholstery cleaning, adding photos and a
              postcode, and sending an enquiry the business can use to prepare a quote.
            </p>
            <p>This is a proposal demonstration, not a launched client site.</p>
            <p>
              <Link href="/local-services#fabricare">Open the proposal demo</Link>
            </p>
          </div>
        </article>
      </section>

      <section id="about" className="wrap">
        <p className="kicker">Introduction</p>
        <h2>About</h2>
        <div className="prose">
          <p>
            I design and build websites, and I put the working process behind them so
            bookings, enquiries and the day’s plan stay together.
          </p>
          <p>
            That work sits alongside time spent in a dive centre in the Azores — taking
            bookings, watching the boats fill, and seeing what the team needs in front
            of them before a departure. It is the same interest I bring to a local
            service business: be found, be clear, and make the next step a booking or
            a quote.
          </p>
        </div>
      </section>

      <section id="contact" className="wrap">
        <div className="contact">
          <div>
            <p className="kicker">Contact</p>
            <h2>Contact</h2>
            <p className="lede">
              Name, email and a short note are enough. If the business already has a
              website, include it.
            </p>
          </div>
          <ContactForm intent={intent} sent={sent} />
        </div>
      </section>
    </>
  );
}
