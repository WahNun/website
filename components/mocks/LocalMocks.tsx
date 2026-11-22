"use client";

import { useState } from "react";
import { DemoBar } from "@/components/mocks/Boards";

export function ServicePageMock() {
  return (
    <div className="phone panel">
      <DemoBar title="Example layout" aside="Service page" />
      <div className="panel__pad" style={{ display: "grid", gap: "0.7rem" }}>
        <p className="kicker">Example business</p>
        <h3>Upholstery cleaning</h3>
        <p>
          Sofas, dining chairs and headboards, cleaned in the home. Most three-seat
          sofas are finished in one visit.
        </p>
        <p>
          <span className="muted">Areas</span>
          <br />
          Southsea, Portsmouth, Gosport, Fareham
        </p>
        <p>
          <span className="muted">Examples</span>
          <br />
          Fabric sofa · velvet armchair · dining chairs
        </p>
        <div className="actions">
          <span className="button">Book a visit</span>
          <span className="button">Request a quote</span>
        </div>
      </div>
    </div>
  );
}

const slots = ["08:30", "10:00", "11:30", "13:30"];

export function AppointmentMock() {
  const [time, setTime] = useState("10:00");
  return (
    <div className="panel">
      <DemoBar title="Example booking" aside="Boiler service" />
      <div className="panel__pad" style={{ display: "grid", gap: "0.8rem" }}>
        <p>Tuesday 24 November · fixed-price visit</p>
        <div className="times" role="group" aria-label="Available times">
          {slots.map((slot) => (
            <button
              key={slot}
              type="button"
              className="time-slot"
              aria-pressed={time === slot}
              disabled={slot === "11:30"}
              onClick={() => setTime(slot)}
            >
              {slot}
            </button>
          ))}
        </div>
        <p>11:30 is already taken.</p>
        <p role="status">
          {time} selected. Confirmation and a reminder the morning before would be
          sent for this time.
        </p>
      </div>
    </div>
  );
}

export function QuoteMock() {
  return (
    <div className="panel">
      <DemoBar title="Example quote request" aside="Not a live enquiry" />
      <div className="panel__pad">
        <dl className="plain">
          <div className="fact">
            <dt>Service</dt>
            <dd>Garden clearance</dd>
          </div>
          <div className="fact">
            <dt>Location</dt>
            <dd>PO4 · example area</dd>
          </div>
          <div className="fact">
            <dt>Photos</dt>
            <dd>2 attached, where they help the estimate</dd>
          </div>
          <div className="fact">
            <dt>Contact</dt>
            <dd>Name, phone and email</dd>
          </div>
          <div className="fact">
            <dt>Note</dt>
            <dd>Access through the side gate.</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

export function SeoMock() {
  return (
    <div className="compare">
      <div className="panel panel__pad">
        <p className="kicker">Profile fields we prepare</p>
        <h3>Business profile</h3>
        <ul className="plain">
          <li>Name, category and hours</li>
          <li>Service area and premises, where there is one</li>
          <li>Services, photos and a link to book or request a quote</li>
        </ul>
        <p className="muted">
          An illustrative list, not Google’s interface.
        </p>
      </div>
      <div className="panel panel__pad">
        <p className="kicker">Service and location pages</p>
        <ul className="plain">
          <li>Boiler service in Portsmouth</li>
          <li>Boiler service in Havant</li>
          <li>Garden clearance in Gosport</li>
        </ul>
        <p className="muted">Pages only for areas the business actually covers.</p>
      </div>
    </div>
  );
}

export function AiVisibilityMock() {
  return (
    <div className="panel">
      <DemoBar title="The same facts, written plainly" aside="Example" />
      <div className="panel__pad">
        <dl>
          <div className="fact">
            <dt>Business</dt>
            <dd>Example business. Home services.</dd>
          </div>
          <div className="fact">
            <dt>Services</dt>
            <dd>Upholstery cleaning, boiler service, garden clearance.</dd>
          </div>
          <div className="fact">
            <dt>Where it works</dt>
            <dd>Southsea, Portsmouth, Gosport and Fareham.</dd>
          </div>
          <div className="fact">
            <dt>What it does not do</dt>
            <dd>No commercial kitchen extraction.</dd>
          </div>
          <div className="fact">
            <dt>Do you cover Southsea?</dt>
            <dd>Yes. Southsea is inside the example area.</dd>
          </div>
          <div className="fact">
            <dt>Can I book online?</dt>
            <dd>Yes for fixed-price visits. Larger jobs start with a quote.</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
