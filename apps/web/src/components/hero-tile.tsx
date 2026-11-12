import Link from "next/link";
import { SmartImage } from "./smart-image";

interface Props {
  href: string;
  label: string;
  image: string;
}

export function HeroTile({ href, label, image }: Props) {
  return (
    <Link href={href} className="group relative block aspect-[4/5] overflow-hidden bg-stone md:aspect-[4/3]">
      <SmartImage
        src={image}
        alt={label}
        fill
        sizes="(min-width: 1024px) 50vw, 100vw"
        priority
        className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
      />
      <div className="absolute inset-0 flex items-end justify-center p-10">
        <span className="font-display text-paper text-[36px] md:text-[48px] tracking-[0.08em] drop-shadow-[0_2px_12px_rgba(0,0,0,0.35)]">
          {label}
        </span>
      </div>
    </Link>
  );
}
