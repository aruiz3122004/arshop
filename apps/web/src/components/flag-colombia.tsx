interface Props {
  className?: string;
  title?: string;
}

// Bandera oficial de Colombia (3:2) con proporciones 2:1:1 (amarillo / azul / rojo).
export function FlagColombia({ className = "", title = "Colombia" }: Props) {
  return (
    <svg
      viewBox="0 0 6 4"
      className={className}
      role="img"
      aria-label={title}
      preserveAspectRatio="xMidYMid meet"
    >
      <title>{title}</title>
      <rect width="6" height="2" y="0" fill="#FCD116" />
      <rect width="6" height="1" y="2" fill="#003893" />
      <rect width="6" height="1" y="3" fill="#CE1126" />
    </svg>
  );
}
