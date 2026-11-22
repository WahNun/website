"use client";

import { useState } from "react";
import { DemoBar } from "@/components/mocks/Boards";

const steps = [
  "Create the booking",
  "Occupancy updates",
  "Guest check-in",
  "Departure list",
  "Staff and courses",
  "Low Season Mode",
];

export function Walkthrough() {
  const [step, setStep] = useState(0);
  return (
    <div className="walk">
      <div className="walk__steps" role="tablist" aria-label="Walkthrough steps">
        {steps.map((label, index) => (
          <button
            key={label}
            type="button"
            className="step-button"
            role="tab"
            aria-selected={step === index}
            aria-current={step === index ? "step" : undefined}
            onClick={() => setStep(index)}
          >
            {index + 1}. {label}
          </button>
        ))}
      </div>
      <div className="panel" role="tabpanel">
        <DemoBar title={steps[step]} aside="Example · Azul 09:00" />
        <div className="panel__pad">{renderStep(step)}</div>
      </div>
      <div className="actions">
        <button
          type="button"
          className="button"
          onClick={() => setStep((value) => Math.max(0, value - 1))}
          disabled={step === 0}
        >
          Back
        </button>
        <button
          type="button"
          className="button"
          onClick={() => setStep((value) => Math.min(steps.length - 1, value + 1))}
          disabled={step === steps.length - 1}
        >
          Next
        </button>
      </div>
    </div>
  );
}

function renderStep(step: number) {
  if (step === 0) {
    return (
      <div className="compare">
        <div>
          <p className="kicker">Online</p>
          <p>Maria Santos requests Azul, 09:00, one diver, from the website.</p>
        </div>
        <div>
          <p className="kicker">Front desk</p>
          <p>The same boat and the same spaces are on the desk if she books in person.</p>
        </div>
      </div>
    );
  }
  if (step === 1) {
    return (
      <div className="compare">
        <p>
          <strong>Before</strong>
          <br />
          Azul 09:00 · 9 of 12 booked · 3 spaces left
        </p>
        <p>
          <strong>After the booking</strong>
          <br />
          Azul 09:00 · 10 of 12 booked · 2 spaces left
        </p>
      </div>
    );
  }
  if (step === 2) {
    return (
      <ul className="plain">
        <li>Details: Maria Santos, complete</li>
        <li>Certification: PADI Open Water on file</li>
        <li>Equipment: BCD and regulator to hire, own 5 mm, 6 kg</li>
        <li>Forms: complete</li>
      </ul>
    );
  }
  if (step === 3) {
    return (
      <ul className="plain">
        <li className="person">
          <strong>Azul · 09:00 · departure list</strong>
          <span>Maria Santos · checked in · kit noted</span>
          <span>Nine other guests already on the boat</span>
          <span>2 spaces still open</span>
        </li>
      </ul>
    );
  }
  if (step === 4) {
    return (
      <p>
        Tuesday Open Water, pool, 13:00. Ana Ribeiro is teaching. 3 of 4 places are
        taken. A scheduling suggestion stays unconfirmed until a member of staff
        reviews it.
      </p>
    );
  }
  return (
    <p>
      Low Season Mode: James Hale, group of 6, July. Customer details, the enquiry
      and a draft quote of €4,200 sit together, with a follow-up on Friday.
    </p>
  );
}
