import { boats, demoDate, demoPlace, nextCourse, outstanding } from "@/lib/demo-data";
import { BoatRow, DemoBar, FlagList } from "@/components/mocks/Boards";

export function DashboardToday() {
  return (
    <div className="ui" aria-label="Demo operations dashboard">
      <DemoBar title={`${demoDate} · ${demoPlace}`} />
      <div className="ui__body dash">
        <section className="panel panel__pad">
          <h3>Boat occupancy</h3>
          <ul className="boats">
            {boats.map((boat) => (
              <BoatRow key={boat.name} boat={boat} />
            ))}
          </ul>
        </section>
        <section className="panel panel__pad">
          <h3>Outstanding check-ins</h3>
          <ul className="plain">
            {outstanding.map((item) => (
              <li key={item.name} className="person">
                <strong>{item.name}</strong>
                <span className="muted">{item.boat}</span>
                <span>{item.issue}</span>
                <FlagList flags={[item.flag]} />
              </li>
            ))}
          </ul>
        </section>
        <section className="panel panel__pad">
          <h3>Next course</h3>
          <p>
            <strong>{nextCourse.name}</strong>
          </p>
          <p>{nextCourse.when}</p>
          <p>Instructor {nextCourse.instructor}</p>
          <p>
            {nextCourse.enrolled} of {nextCourse.capacity} enrolled
          </p>
          <p className="muted">{nextCourse.note}</p>
        </section>
      </div>
    </div>
  );
}
