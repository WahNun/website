import type { Boat, Flag } from "@/lib/demo-data";

export function DemoBar({ title, aside = "Demo data" }: { title: string; aside?: string }) {
  return (
    <div className="ui__bar">
      <span>{title}</span>
      <span>{aside}</span>
    </div>
  );
}

export function FlagList({ flags }: { flags: Flag[] }) {
  if (!flags.length) return null;
  return (
    <p className="flags">
      {flags.map((flag) => (
        <span
          key={flag}
          className={flag === "Medical review" ? "flag flag--medical" : "flag flag--check"}
        >
          {flag}
        </span>
      ))}
    </p>
  );
}

export function BoatRow({ boat }: { boat: Boat }) {
  const spaces = boat.capacity - boat.booked;
  const width = Math.round((boat.booked / boat.capacity) * 100);
  return (
    <li className="boat">
      <div className="boat__top">
        <span className="boat__time">{boat.time}</span>
        <span className="boat__name">{boat.name}</span>
        <span className="boat__count">
          {boat.booked}/{boat.capacity}
        </span>
      </div>
      <p className="boat__trip">{boat.trip}</p>
      <div className="meter" aria-hidden="true">
        <span style={{ width: `${width}%` }} />
      </div>
      <p className="boat__spaces">
        {boat.booked} of {boat.capacity} booked
        {spaces === 0 ? " · Full" : ` · ${spaces} ${spaces === 1 ? "space" : "spaces"} left`}
      </p>
      <FlagList flags={boat.flags} />
    </li>
  );
}
