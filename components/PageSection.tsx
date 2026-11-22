export function PageSection({
  id,
  index,
  title,
  intro,
  children,
}: {
  id: string;
  index: string;
  title: string;
  intro: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section id={id} className="block">
      <div className="block__copy">
        <p className="kicker">{index}</p>
        <h2>{title}</h2>
        <div className="prose">{intro}</div>
      </div>
      {children}
    </section>
  );
}

export function PageNav({
  links,
}: {
  links: { href: string; label: string }[];
}) {
  return (
    <nav className="page-nav" aria-label="On this page">
      {links.map((link) => (
        <a key={link.href} href={link.href}>
          {link.label}
        </a>
      ))}
    </nav>
  );
}
