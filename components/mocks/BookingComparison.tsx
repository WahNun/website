import { boats } from "@/lib/demo-data";
import { DemoBar } from "@/components/mocks/Boards";

function spaces(booked: number, capacity: number) {
  const left = capacity - booked;
  return left === 1 ? "1 space" : `${left} spaces`;
}

export function BookingComparison() {
  return (
    <div>
      <div className="compare">
        <div className="panel">
          <DemoBar title="Website booking" aside="Guest" />
          <div className="panel__pad" style={{ display: "grid", gap: "0.7rem" }}>
            <p>Saturday 28 November</p>
            {boats.map((boat) => (
              <div key={boat.name} className="split">
                <span>
                  {boat.time} {boat.name}
                  <br />
                  <span className="muted">{boat.trip}</span>
                </span>
                <span>{spaces(boat.booked, boat.capacity)}</span>
              </div>
            ))}
            <p>
              Selected: Azul 09:00 · Maria Santos · 1 diver · €145
            </p>
            <p className="button" style={{ pointerEvents: "none" }}>
              Request booking
            </p>
          </div>
        </div>
        <div className="panel">
          <DemoBar title="Front desk" aside="Same availability" />
          <div className="panel__pad" style={{ display: "grid", gap: "0.7rem" }}>
            <p>Walk-in · desk</p>
            {boats.map((boat) => (
              <div key={boat.name} className="split">
                <span>
                  {boat.time} {boat.name}
                </span>
                <span>
                  {boat.booked}/{boat.capacity}
                </span>
              </div>
            ))}
            <p>Add Maria Santos to Azul 09:00. The website shows the same two spaces.</p>
            <p className="button" style={{ pointerEvents: "none" }}>
              Add to Azul
            </p>
          </div>
        </div>
      </div>
      <div className="panel" style={{ marginTop: "1rem" }}>
        <DemoBar title="Booking management" aside="Both sources" />
        <div className="panel__pad">
          <p>Azul 09:00 · 10 confirmed · 2 spaces left · website 7 · front desk 3</p>
        </div>
      </div>
    </div>
  );
}
