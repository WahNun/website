import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { MediaFrame } from "@/components/MediaFrame";
import { PageNav, PageSection } from "@/components/PageSection";
import { BookingComparison } from "@/components/mocks/BookingComparison";
import { CheckInViews } from "@/components/mocks/CheckInViews";
import { DashboardToday } from "@/components/mocks/DashboardToday";
import { LowSeason } from "@/components/mocks/LowSeason";
import { StaffPlanner } from "@/components/mocks/StaffPlanner";
import { Walkthrough } from "@/components/mocks/Walkthrough";
import { photos } from "@/lib/photos";

export const metadata: Metadata = {
  title: "Run your dive centre from one dashboard",
  description:
    "See live boat occupancy, guest check-in, staff planning and course management in one dashboard. Online and front desk bookings feed the same system.",
  alternates: { canonical: "/dive-centres" },
};

export default function DiveCentresPage() {
  return (
    <>
      <section className="hero hero--panel">
        <div className="hero__media">
          <Image
            src={photos.diveDeck.src}
            alt={photos.diveDeck.alt}
            fill
            priority
            sizes="100vw"
            className="cover cover--deck"
          />
        </div>
        <div className="hero__scrim" />
        <div className="hero__content">
          <h1>Run your dive centre from one dashboard.</h1>
          <p className="lede">
            See who’s booked, how many spaces are left on each boat, which guests
            still need to check in and who’s teaching the next course. Take bookings
            online and at the front desk, with both feeding into the same dashboard.
          </p>
          <div className="hero__actions">
            <a className="button" href="#dashboard">
              Explore the dashboard
            </a>
            <Link className="button" href="/#contact?intent=walkthrough">
              Book a walkthrough
            </Link>
          </div>
          <PageNav
            links={[
              { href: "#today", label: "Today" },
              { href: "#check-in", label: "Check-in" },
              { href: "#planning", label: "Staff and courses" },
              { href: "#bookings", label: "Bookings" },
              { href: "#low-season", label: "Low season" },
              { href: "#development", label: "Development" },
              { href: "#walkthrough", label: "Walkthrough" },
            ]}
          />
        </div>
        <div className="hero__panel" id="dashboard">
          <MediaFrame
            slot="screenshots/dashboard-today"
            caption="Live boat occupancy, outstanding check-ins and the next course. Demo data."
          >
            <DashboardToday />
          </MediaFrame>
        </div>
      </section>

      <PageSection
        id="today"
        index="01"
        title="See what’s happening today"
        intro={
          <p>
            Live boat occupancy, remaining spaces, guest lists and booking management
            by departure. A check-in flag marks missing information. A medical flag
            marks a declaration that needs a member of staff to review it.
          </p>
        }
      >
        <MediaFrame
          slot="screenshots/today"
          caption="Departures for the morning, with spaces left and flags for the team."
        >
          <DashboardToday />
        </MediaFrame>
      </PageSection>

      <PageSection
        id="check-in"
        index="02"
        title="Let guests check in before arrival"
        intro={
          <p>
            Guests check in on their phone: details, certification, rental equipment
            and the forms that apply. The team sees what is complete and what still
            needs a review.
          </p>
        }
      >
        <MediaFrame
          slot="screenshots/check-in"
          caption="A guest’s phone check-in beside the team’s completion and review status."
        >
          <CheckInViews />
        </MediaFrame>
      </PageSection>

      <PageSection
        id="planning"
        index="03"
        title="Plan your staff and courses together"
        intro={
          <p>
            Staff planning and courses share one schedule: dates, enrolments and
            instructor assignments. Suggestions for scheduling and course allocation
            use availability and capacity. A member of staff reviews the plan before
            it is confirmed.
          </p>
        }
      >
        <MediaFrame
          slot="screenshots/staff-planning"
          caption="A week of staff and courses, with an unconfirmed scheduling suggestion."
        >
          <StaffPlanner />
        </MediaFrame>
      </PageSection>

      <PageSection
        id="bookings"
        index="04"
        title="Take bookings online and at the front desk"
        intro={
          <p>
            The customer-facing booking screen and the front office use the same
            availability. Both feed booking management, so the desk and the website
            are not selling two versions of the day.
          </p>
        }
      >
        <MediaFrame
          slot="screenshots/bookings"
          caption="Online booking beside the front desk, with one shared list underneath."
        >
          <BookingComparison />
        </MediaFrame>
      </PageSection>

      <PageSection
        id="low-season"
        index="05"
        title="Keep enquiries and quotes together in the low season"
        intro={
          <p>
            Low Season Mode is its own view. Customer details, enquiries, quotes and
            follow-ups stay in one list instead of across separate inboxes.
          </p>
        }
      >
        <MediaFrame
          slot="screenshots/low-season"
          caption="Low Season Mode, with enquiries, draft quotes and follow-ups."
        >
          <LowSeason />
        </MediaFrame>
      </PageSection>

      <PageSection
        id="development"
        index="06"
        title="Website and backend development"
        intro={
          <p>
            The public site and the tools behind the desk are built as one piece of
            work.
          </p>
        }
      >
        <ul className="offer">
          <li>
            <h3>Website</h3>
            <p>
              Mobile website design and frontend development for dives, trips and
              courses.
            </p>
          </li>
          <li>
            <h3>Booking</h3>
            <p>
              Booking integration, or a custom interface where a standard widget does
              not fit the way the centre works.
            </p>
          </li>
          <li>
            <h3>Backend</h3>
            <p>
              Backend development for the team’s dashboard, check-in and the
              day-to-day process.
            </p>
          </li>
        </ul>
      </PageSection>

      <section id="walkthrough" className="block">
        <div className="block__copy">
          <p className="kicker">Walkthrough</p>
          <h2>Walkthrough</h2>
          <div className="prose">
            <p>
              Create a booking online or at the front desk, see boat occupancy update,
              complete the guest check-in, then review the departure list.
            </p>
            <p>
              The last two steps are short views of staff and course planning, and of
              Low Season Mode.
            </p>
          </div>
        </div>
        <MediaFrame
          slot="screenshots/walkthrough"
          caption="A booking followed through to the departure list, then staff planning and Low Season Mode."
        >
          <Walkthrough />
        </MediaFrame>
      </section>

      <section className="band">
        <div className="band__media">
          <Image
            src={photos.heroSea.src}
            alt={photos.heroSea.alt}
            fill
            sizes="100vw"
            className="cover cover--sea"
          />
        </div>
        <div className="band__scrim" />
        <div className="band__content">
          <h2>See how it would work for your dive centre.</h2>
          <p className="lede">
            Follow a booking from your website or front desk through to guest check-in
            and see how it appears on the boat schedule.
          </p>
          <Link className="button" href="/#contact?intent=walkthrough">
            Book a walkthrough
          </Link>
        </div>
      </section>
    </>
  );
}
