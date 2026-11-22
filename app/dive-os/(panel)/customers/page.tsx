import type { Metadata } from "next";

export const metadata: Metadata = { title: "Customers" };

export default function CustomersPage() {
  return (
    <>
      <p className="kicker">Placeholder</p>
      <h1>Customers and dive centres</h1>
      <p className="lede">
        Centres you support will be listed here when the admin tools are connected.
      </p>
      <div className="placeholder">
        <p className="tag">Placeholder</p>
        <p>No dive centres yet.</p>
      </div>
    </>
  );
}
