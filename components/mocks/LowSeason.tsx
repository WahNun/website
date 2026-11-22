import { lowSeason } from "@/lib/demo-data";
import { DemoBar } from "@/components/mocks/Boards";

export function LowSeason() {
  return (
    <div className="panel">
      <DemoBar title="Low Season Mode" aside="Enquiries and quotes" />
      <div className="panel__pad">
        <ul className="plain">
          {lowSeason.map((item) => (
            <li key={item.name} className="person">
              <div className="split">
                <strong>{item.name}</strong>
                <span className="flag flag--check">{item.status}</span>
              </div>
              <span>{item.detail}</span>
              <span>{item.quote}</span>
              <span className="muted">{item.follow}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
