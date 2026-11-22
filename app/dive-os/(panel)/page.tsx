import type { Metadata } from "next";

export const metadata: Metadata = { title: "Overview" };

export default function OverviewPage() {
  return (
    <>
      <p className="kicker">Placeholder</p>
      <h1>Overview</h1>
      <p className="lede">
        Dive OS will be where dive centre software is managed and updated. Nothing
        here is connected to a live centre yet.
      </p>
      <div className="os-cards">
        <article className="placeholder">
          <p className="tag">Placeholder</p>
          <h2>Today</h2>
          <p>A summary of centres, recent updates and anything that needs attention will go here.</p>
        </article>
        <article className="placeholder">
          <p className="tag">Placeholder</p>
          <h2>Next step</h2>
          <p>Releases, customer records and settings are empty shells until the admin tools are built.</p>
        </article>
      </div>
    </>
  );
}
