"use client";

import { useState } from "react";
import { rota, suggestion } from "@/lib/demo-data";
import { DemoBar } from "@/components/mocks/Boards";

export function StaffPlanner() {
  const [confirmed, setConfirmed] = useState(false);
  return (
    <div className="panel">
      <DemoBar title="Week of 23 November" aside="Staff and courses" />
      <div className="panel__pad" style={{ display: "grid", gap: "1rem" }}>
        <ul className="plain">
          {rota.map((day) => (
            <li key={day.day} className="person">
              <div className="split">
                <strong>{day.day}</strong>
                <span>{day.title}</span>
              </div>
              <span>{day.detail}</span>
            </li>
          ))}
        </ul>
        <div className="panel" style={{ padding: "0.9rem" }}>
          <p className="kicker">Suggestion · not confirmed</p>
          <p style={{ marginTop: "0.55rem" }}>{suggestion}</p>
          <div className="actions" style={{ marginTop: "0.9rem" }}>
            <button
              type="button"
              className="button"
              aria-pressed={confirmed}
              onClick={() => setConfirmed(true)}
            >
              {confirmed ? "Suggestion noted" : "Mark as reviewed"}
            </button>
          </div>
          {confirmed ? (
            <p className="form-note" role="status">
              Reviewed in this browser only. Nothing is saved to a dive centre.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
