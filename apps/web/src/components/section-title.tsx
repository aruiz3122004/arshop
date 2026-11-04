interface Props {
  children: React.ReactNode;
  as?: "h1" | "h2" | "h3";
  align?: "center" | "left";
}

export function SectionTitle({ children, as: Tag = "h2", align = "center" }: Props) {
  return (
    <div className={`py-6 sm:py-9 md:py-12 ${align === "center" ? "text-center" : ""}`}>
      <Tag className="font-display text-[28px] md:text-[30px] leading-tight tracking-tight text-carbon">
        {children}
      </Tag>
    </div>
  );
}
