import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-[560px] flex-col items-center gap-6 px-6 py-28 text-center">
      <p className="font-display text-[48px] text-carbon leading-none">404</p>
      <p className="text-[15px] text-graphite">
        La página que buscas no existe o se ha movido.
      </p>
      <Link
        href="/"
        className="caption uppercase tracking-[0.16em] border-b border-carbon pb-1 text-carbon hover:opacity-70"
      >
        Volver al inicio
      </Link>
    </div>
  );
}
