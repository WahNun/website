import Image from "next/image";
import Link from "next/link";
import type { Photo } from "@/lib/photos";

export function PhotoBand({
  photo,
  imageClass = "cover",
  kicker,
  title,
  text,
  href,
  action,
  id,
}: {
  photo: Photo;
  imageClass?: string;
  kicker?: string;
  title: string;
  text: string;
  href?: string;
  action?: string;
  id?: string;
}) {
  return (
    <section className="band" id={id}>
      <div className="band__media">
        <Image src={photo.src} alt={photo.alt} fill sizes="100vw" className={imageClass} />
      </div>
      <div className="band__scrim" />
      <div className="band__content">
        {kicker ? <p className="kicker">{kicker}</p> : null}
        <h2>{title}</h2>
        <p className="lede">{text}</p>
        {href && action ? (
          <Link className="button" href={href}>
            {action}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
