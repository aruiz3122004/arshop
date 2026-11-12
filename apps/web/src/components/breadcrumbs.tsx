import Link from "next/link";
import { Fragment } from "react";

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="caption flex flex-wrap items-center gap-x-2 gap-y-1 uppercase tracking-[0.14em] text-graphite">
        {items.map((c, i) => (
          <Fragment key={`${c.label}-${i}`}>
            {i > 0 && <span aria-hidden>/</span>}
            {c.href ? (
              <li>
                <Link href={c.href} className="hover:text-carbon">
                  {c.label}
                </Link>
              </li>
            ) : (
              <li className="text-carbon break-words">{c.label}</li>
            )}
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
