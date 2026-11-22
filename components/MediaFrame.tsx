import fs from "node:fs";
import path from "node:path";
import Image from "next/image";

const extensions = ["webp", "jpg", "jpeg", "png", "avif"] as const;

function findScreenshot(slot: string) {
  const base = slot.replace(/\.(webp|jpe?g|png|avif)$/i, "");
  for (const extension of extensions) {
    const relative = `${base}.${extension}`;
    if (fs.existsSync(path.join(process.cwd(), "public", relative))) {
      return `/${relative}`;
    }
  }
  return null;
}

export function MediaFrame({
  slot,
  caption,
  children,
}: {
  slot: string;
  caption: string;
  children: React.ReactNode;
}) {
  const src = findScreenshot(slot);
  return (
    <figure className="frame" data-replace={`public/${slot}`}>
      <div className="frame__label">
        <span>{src ? "Screenshot" : "Demo view"}</span>
      </div>
      <div className={src ? "frame__shot" : "frame__live"}>
        {src ? (
          <Image
            src={src}
            alt={caption}
            fill
            sizes="(min-width: 960px) 1120px, 100vw"
          />
        ) : (
          children
        )}
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
