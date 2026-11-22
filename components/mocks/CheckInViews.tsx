import { checkInGuests } from "@/lib/demo-data";
import { DemoBar, FlagList } from "@/components/mocks/Boards";

export function CheckInViews() {
  return (
    <div className="checkin">
      <div className="phone panel">
        <DemoBar title="Guest check-in" aside="Phone" />
        <div className="panel__pad">
          <p className="kicker">Maria Santos · Azul 09:00</p>
          <h3 style={{ margin: "0.6rem 0" }}>Equipment</h3>
          <ul className="plain">
            <li className="split">
              <span>BCD</span>
              <span>Hire</span>
            </li>
            <li className="split">
              <span>Regulator</span>
              <span>Hire</span>
            </li>
            <li className="split">
              <span>Wetsuit</span>
              <span>Own 5 mm</span>
            </li>
            <li className="split">
              <span>Weights</span>
              <span>6 kg</span>
            </li>
          </ul>
          <p className="muted" style={{ marginTop: "0.9rem" }}>
            Details, certification and forms are already complete on the earlier steps.
          </p>
        </div>
      </div>
      <div className="panel">
        <DemoBar title="Team review" aside="Completion and status" />
        <div className="panel__pad">
          <ul className="plain">
            {checkInGuests.map((guest) => (
              <li key={guest.name} className="person">
                <div className="split">
                  <strong>{guest.name}</strong>
                  {guest.flag ? <FlagList flags={[guest.flag]} /> : <span className="flag flag--ok">Complete</span>}
                </div>
                <span className="muted">{guest.boat}</span>
                <span>Details: {guest.details}</span>
                <span>Certification: {guest.certification}</span>
                <span>Equipment: {guest.equipment}</span>
                <span>Forms: {guest.forms}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
