import type { Metadata } from "next";

export const metadata: Metadata = { title: "Releases" };

export default function ReleasesPage() {
  return (
    <>
      <p className="kicker">Placeholder</p>
      <h1>Releases and updates</h1>
      <p className="lede">
        Software releases and notes for dive centres will be recorded here.
      </p>
      <div className="placeholder">
        <p className="tag">Placeholder</p>
        <p>No releases yet.</p>
      </div>
    </>
  );
}
