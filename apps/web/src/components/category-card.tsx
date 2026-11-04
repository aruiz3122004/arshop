import Link from "next/link";
import { SmartImage } from "./smart-image";

interface Props {
  href: string;
  label: string;
  image: string;
  aspect?: "square" | "portrait" | "landscape";
}

const aspectMap = {
  square: "aspect-square",
  portrait: "aspect-[3/4]",
  landscape: "aspect-[4/3]",
} as const;

export function CategoryCard({ href, label, image, aspect = "portrait" }: Props) {
  return (
    <Link href={href} className="group block">
      <div className={`relative w-full overflow-hidden bg-stone ${aspectMap[aspect]}`}>
        <SmartImage
          src={image}
          alt={label}
          fill
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
        />
      </div>
      <p className="caption mt-3 uppercase tracking-[0.14em] text-carbon">
        {label}
      </p>
    </Link>
  );
}
