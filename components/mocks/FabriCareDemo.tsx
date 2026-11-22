"use client";

import { useState } from "react";
import Image from "next/image";
import { photos } from "@/lib/photos";
import { services } from "@/lib/demo-data";
import { DemoBar } from "@/components/mocks/Boards";

export function FabriCareDemo() {
  const [service, setService] = useState(services[0]);
  const [postcode, setPostcode] = useState("PO1 1AA");
  const [sent, setSent] = useState(false);

  return (
    <div className="fabricare">
      <form
        className="panel"
        onSubmit={(event) => {
          event.preventDefault();
          setSent(true);
        }}
      >
        <DemoBar title="Customer" aside="Proposal demo" />
        <div className="panel__pad" style={{ display: "grid", gap: "1rem" }}>
          <fieldset className="stack" style={{ border: 0, margin: 0, padding: 0 }}>
            <legend className="kicker">1 · Service</legend>
            {services.map((item) => (
              <button
                key={item}
                type="button"
                className="choice"
                aria-pressed={service === item}
                onClick={() => {
                  setService(item);
                  setSent(false);
                }}
              >
                {item}
              </button>
            ))}
          </fieldset>
          <div>
            <p className="kicker">2 · Photos</p>
            <div className="samples">
              <figure>
                <div className="shot">
                  <Image
                    src={photos.sampleSofa.src}
                    alt={photos.sampleSofa.alt}
                    fill
                    sizes="200px"
                  />
                </div>
                <figcaption>Sample photo · sofa</figcaption>
              </figure>
              <figure>
                <div className="shot">
                  <Image
                    src={photos.localHome.src}
                    alt={photos.localHome.alt}
                    fill
                    sizes="200px"
                  />
                </div>
                <figcaption>Sample photo · room</figcaption>
              </figure>
            </div>
            <p className="hint">
              On a live site the customer uploads their own photos. These two are samples.
            </p>
          </div>
          <label>
            <span className="kicker">3 · Postcode</span>
            <input
              value={postcode}
              onChange={(event) => {
                setPostcode(event.target.value);
                setSent(false);
              }}
              aria-describedby="postcode-note"
            />
          </label>
          <p id="postcode-note" className="hint">
            Example postcode only.
          </p>
          <div className="stack">
            <p className="kicker">4 · Contact</p>
            <p>Jordan Blake · jordan.blake@example.com · 07700 900123</p>
            <p>Note: two-seat sofa, coffee stain on the left arm.</p>
          </div>
          <button type="submit" className="button">
            Submit enquiry
          </button>
        </div>
      </form>
      <aside className="panel" aria-live="polite">
        <DemoBar title="What the business receives" aside={sent ? "Submitted in this demo" : "Preview"} />
        <div className="panel__pad" style={{ display: "grid", gap: "0.45rem" }}>
          <p className="kicker">FabriCare · proposal demo</p>
          <p>
            <strong>FC-1042</strong>
          </p>
          <p>Service: {service}</p>
          <p>Postcode: {postcode || "Not entered"}</p>
          <p>Photos: 2 samples</p>
          <p>Customer: Jordan Blake</p>
          <p>Note: two-seat sofa, coffee stain on the left arm.</p>
          <p className={sent ? "flag flag--ok" : "flag flag--check"}>
            {sent ? "New — ready to price" : "Draft preview"}
          </p>
          <p className="hint">
            This demo does not send the enquiry to a business or store it.
          </p>
        </div>
      </aside>
    </div>
  );
}
