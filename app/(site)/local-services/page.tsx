import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { MediaFrame } from "@/components/MediaFrame";
import { PageNav, PageSection } from "@/components/PageSection";
import { FabriCareDemo } from "@/components/mocks/FabriCareDemo";
import {
  AiVisibilityMock,
  AppointmentMock,
  QuoteMock,
  SeoMock,
  ServicePageMock,
} from "@/components/mocks/LocalMocks";
import { photos } from "@/lib/photos";

export const metadata: Metadata = {
  title: "Get found locally. Make it easy to book.",
  description:
    "Websites, online booking and structured quote requests for local service businesses, with local SEO, Google Maps and clearer AI search visibility.",
  alternates: { canonical: "/local-services" },
};

export default function LocalServicesPage() {
  return (
    <>
      <section className="hero">
        <div className="hero__media">
          <Image
            src={photos.localWorkshop.src}
            alt={photos.localWorkshop.alt}
            fill
            priority
            sizes="100vw"
            className="cover cover--workshop"
          />
        </div>
        <div className="hero__scrim" />
        <div className="hero__content">
          <h1>Get found locally. Make it easy to book.</h1>
          <p className="lede">
            Help customers find you on Google Search and Maps, understand what you
            offer, and book a visit or request a quote in a few clicks.
          </p>
          <div className="hero__actions">
            <Link className="button" href="/#contact?intent=website">
              Discuss your website
            </Link>
            <a className="button" href="#fabricare">
              See an example
            </a>
          </div>
          <PageNav
            links={[
              { href: "#website", label: "Website" },
              { href: "#appointments", label: "Appointments" },
              { href: "#quotes", label: "Quotes" },
              { href: "#local-seo", label: "Local SEO" },
              { href: "#ai-search", label: "AI search" },
              { href: "#fabricare", label: "FabriCare" },
            ]}
          />
        </div>
      </section>

      <PageSection
        id="website"
        index="01"
        title="Website design and development"
        intro={
          <p>
            Service pages are built for a phone first: a clear description, the areas
            you cover, examples of the work, and a straightforward way to get in touch.
          </p>
        }
      >
        <MediaFrame
          slot="screenshots/service-page"
          caption="An example service page: description, areas, examples and contact options."
        >
          <ServicePageMock />
        </MediaFrame>
      </PageSection>

      <PageSection
        id="appointments"
        index="02"
        title="Online appointment booking"
        intro={
          <p>
            For work a customer can book directly: available times, a confirmation,
            and an optional reminder before the visit.
          </p>
        }
      >
        <MediaFrame
          slot="screenshots/appointments"
          caption="Available times for a fixed-price visit, with confirmation and a reminder."
        >
          <AppointmentMock />
        </MediaFrame>
      </PageSection>

      <PageSection
        id="quotes"
        index="03"
        title="Structured quote requests"
        intro={
          <p>
            Jobs that need an estimate ask for the service, the location, photos where
            they help, and contact details.
          </p>
        }
      >
        <MediaFrame
          slot="screenshots/quote-request"
          caption="A structured quote request: service, location, photos and contact details."
        >
          <QuoteMock />
        </MediaFrame>
      </PageSection>

      <PageSection
        id="local-seo"
        index="04"
        title="Local SEO and Google Maps"
        intro={
          <p>
            Google Business Profile optimisation, technical SEO foundations, and
            service and location pages that reflect the areas the business serves.
          </p>
        }
      >
        <MediaFrame
          slot="screenshots/local-seo"
          caption="Profile fields and example service pages for the areas a business covers."
        >
          <SeoMock />
        </MediaFrame>
      </PageSection>

      <PageSection
        id="ai-search"
        index="05"
        title="AI search visibility"
        intro={
          <p>
            Business information, services, coverage areas and common questions are
            structured so search and AI systems can more easily identify what the
            business offers and where it operates.
          </p>
        }
      >
        <MediaFrame
          slot="screenshots/ai-visibility"
          caption="The same business facts written so a person, a search engine or an assistant can read them."
        >
          <AiVisibilityMock />
        </MediaFrame>
      </PageSection>

      <PageSection
        id="fabricare"
        index="06"
        title="FabriCare proposal demo"
        intro={
          <>
            <p className="pill">Proposal demo</p>
            <p>
              A customer chooses an upholstery cleaning service, adds photos and a
              postcode, and submits an enquiry the business can use to prepare a quote.
            </p>
            <p>This is a proposal demonstration, not a launched client site.</p>
          </>
        }
      >
        <MediaFrame
          slot="screenshots/fabricare"
          caption="The FabriCare quote request, and the enquiry a business would use to prepare a quote."
        >
          <FabriCareDemo />
        </MediaFrame>
      </PageSection>

      <section className="band">
        <div className="band__media">
          <Image
            src={photos.localHome.src}
            alt={photos.localHome.alt}
            fill
            sizes="100vw"
            className="cover cover--home"
          />
        </div>
        <div className="band__scrim" />
        <div className="band__content">
          <h2>A website that makes the next step obvious.</h2>
          <p className="lede">
            Tell me about the business, the area you cover, and whether customers
            should book a time or ask for a quote.
          </p>
          <Link className="button" href="/#contact?intent=website">
            Discuss your website
          </Link>
        </div>
      </section>
    </>
  );
}
