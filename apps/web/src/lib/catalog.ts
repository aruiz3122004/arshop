export type Gender = "hombre" | "mujer";

export type CategorySlug =
  | "camisas"
  | "camisetas"
  | "tops"
  | "ropa-interior"
  | "calzado"
  | "pantalones";

export interface Category {
  slug: CategorySlug;
  label: string;
  genders: Gender[];
  cover: string;
}

/**
 * Imagen placeholder determinista (solo fallback para seeds sin foto).
 * El catálogo real usa URLs de Unsplash guardadas en DB (ver `unsplash` abajo).
 */
const img = (seed: string, w = 800, h = 1000) =>
  `https://picsum.photos/seed/arshop-${seed}/${w}/${h}?grayscale`;

/** Builder de URL Unsplash: portrait 800×1000 para covers, landscape para heroes. */
const unsplash = (photoId: string, variant: "portrait" | "hero" = "portrait") =>
  `https://images.unsplash.com/photo-${photoId}?${
    variant === "hero" ? "w=1600&h=1200" : "w=800&h=1000"
  }&fit=crop&auto=format&q=80`;

export const CATEGORIES: Category[] = [
  {
    slug: "camisas",
    label: "Camisas",
    genders: ["hombre", "mujer"],
    // Camisa blanca de vestir en hombre
    cover: unsplash("1621072156002-e2fccdc0b176"),
  },
  {
    slug: "camisetas",
    label: "Camisetas",
    genders: ["hombre", "mujer"],
    // Camiseta blanca cuello redondo en percha
    cover: unsplash("1581655353564-df123a1eb820"),
  },
  {
    slug: "tops",
    label: "Tops",
    genders: ["mujer"],
    // Dos tops producto blanco + verde
    cover: unsplash("1759572095384-1a7e646d0d4f"),
  },
  {
    slug: "ropa-interior",
    label: "Ropa interior",
    genders: ["hombre", "mujer"],
    // Pila de suéteres neutros doblados
    cover: unsplash("1760013531865-89ff324f83a6"),
  },
  {
    slug: "calzado",
    label: "Calzado",
    genders: ["hombre", "mujer"],
    // Sneakers blancos sobre caja
    cover: unsplash("1560769629-975ec94e6a86"),
  },
  {
    slug: "pantalones",
    label: "Pantalones",
    genders: ["hombre", "mujer"],
    // Pila de jeans producto
    cover: unsplash("1637069585336-827b298fe84a"),
  },
];

export const GENDER_HEROES: Record<Gender, { title: string; image: string }> = {
  hombre: {
    // Blazer + trousers neutros editorial
    title: "Hombre",
    image: unsplash("1613915617430-8ab0fd7c6baf", "hero"),
  },
  mujer: {
    // Mujer con traje editorial elegante
    title: "Mujer",
    image: unsplash("1578432156830-0ca0d7913b7f", "hero"),
  },
};

export interface ProductVariant {
  id: string;
  sku: string;
  size: string;
  stock: number;
  color_name: string;
  color_hex: string;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  brand: string;
  price: number;
  currency: "COP";
  gender: Gender;
  category: CategorySlug;
  images: string[];
  colors: { name: string; hex: string }[];
  sizes: string[];
  description: string;
  variants?: ProductVariant[];
  compareAtPrice?: number | null;
  fit?: "slim" | "regular" | "relaxed" | "oversize" | null;
  sizeGuide?: Record<string, any> | null;
}

export interface SizeMeasurementRow {
  size: string;
  chestOrWaist: string;
  lengthOrHip: string;
  sleeveOrInseam: string;
}

export function getDefaultSizeGuide(
  category: CategorySlug,
  gender: Gender,
): {
  columns: [string, string, string, string];
  rows: SizeMeasurementRow[];
  tip: string;
} {
  if (category === "calzado") {
    return {
      columns: ["Talla EU", "Largo pie (cm)", "Equiv. US", "Equiv. COL"],
      rows:
        gender === "mujer"
          ? [
              { size: "35", chestOrWaist: "22.5", lengthOrHip: "5", sleeveOrInseam: "35" },
              { size: "36", chestOrWaist: "23.2", lengthOrHip: "6", sleeveOrInseam: "36" },
              { size: "37", chestOrWaist: "23.8", lengthOrHip: "6.5", sleeveOrInseam: "37" },
              { size: "38", chestOrWaist: "24.5", lengthOrHip: "7.5", sleeveOrInseam: "38" },
              { size: "39", chestOrWaist: "25.1", lengthOrHip: "8.5", sleeveOrInseam: "39" },
              { size: "40", chestOrWaist: "25.8", lengthOrHip: "9", sleeveOrInseam: "40" },
            ]
          : [
              { size: "39", chestOrWaist: "25.0", lengthOrHip: "7", sleeveOrInseam: "39" },
              { size: "40", chestOrWaist: "25.7", lengthOrHip: "7.5", sleeveOrInseam: "40" },
              { size: "41", chestOrWaist: "26.4", lengthOrHip: "8.5", sleeveOrInseam: "41" },
              { size: "42", chestOrWaist: "27.1", lengthOrHip: "9", sleeveOrInseam: "42" },
              { size: "43", chestOrWaist: "27.8", lengthOrHip: "10", sleeveOrInseam: "43" },
              { size: "44", chestOrWaist: "28.5", lengthOrHip: "11", sleeveOrInseam: "44" },
            ],
      tip: "Mide tu pie del talón a la punta sobre una hoja de papel al final del día.",
    };
  }

  if (category === "pantalones") {
    return {
      columns: ["Talla", "Cintura (cm)", "Cadera (cm)", "Tiro / Entrepierna (cm)"],
      rows:
        gender === "mujer"
          ? [
              { size: "XS / 6", chestOrWaist: "62 – 65", lengthOrHip: "88 – 91", sleeveOrInseam: "76" },
              { size: "S / 8", chestOrWaist: "66 – 69", lengthOrHip: "92 – 95", sleeveOrInseam: "77" },
              { size: "M / 10", chestOrWaist: "70 – 74", lengthOrHip: "96 – 100", sleeveOrInseam: "78" },
              { size: "L / 12", chestOrWaist: "75 – 80", lengthOrHip: "101 – 106", sleeveOrInseam: "78" },
              { size: "XL / 14", chestOrWaist: "81 – 86", lengthOrHip: "107 – 112", sleeveOrInseam: "79" },
            ]
          : [
              { size: "28 / XS", chestOrWaist: "72 – 75", lengthOrHip: "90 – 93", sleeveOrInseam: "80" },
              { size: "30 / S", chestOrWaist: "76 – 80", lengthOrHip: "94 – 98", sleeveOrInseam: "81" },
              { size: "32 / M", chestOrWaist: "81 – 85", lengthOrHip: "99 – 103", sleeveOrInseam: "82" },
              { size: "34 / L", chestOrWaist: "86 – 91", lengthOrHip: "104 – 108", sleeveOrInseam: "82" },
              { size: "36 / XL", chestOrWaist: "92 – 97", lengthOrHip: "109 – 114", sleeveOrInseam: "83" },
            ],
      tip: "Si estás entre dos tallas, elige la menor para un calce estructurado o la mayor para caída relajada.",
    };
  }

  return {
    columns: ["Talla", "Pecho (cm)", "Largo total (cm)", "Hombro / Manga (cm)"],
    rows:
      gender === "mujer"
        ? [
            { size: "XS", chestOrWaist: "80 – 84", lengthOrHip: "58", sleeveOrInseam: "59" },
            { size: "S", chestOrWaist: "85 – 89", lengthOrHip: "60", sleeveOrInseam: "60" },
            { size: "M", chestOrWaist: "90 – 95", lengthOrHip: "62", sleeveOrInseam: "61" },
            { size: "L", chestOrWaist: "96 – 102", lengthOrHip: "64", sleeveOrInseam: "62" },
            { size: "XL", chestOrWaist: "103 – 109", lengthOrHip: "66", sleeveOrInseam: "63" },
          ]
        : [
            { size: "XS", chestOrWaist: "88 – 92", lengthOrHip: "69", sleeveOrInseam: "62" },
            { size: "S", chestOrWaist: "93 – 97", lengthOrHip: "71", sleeveOrInseam: "63" },
            { size: "M", chestOrWaist: "98 – 103", lengthOrHip: "73", sleeveOrInseam: "64" },
            { size: "L", chestOrWaist: "104 – 110", lengthOrHip: "75", sleeveOrInseam: "65" },
            { size: "XL", chestOrWaist: "111 – 117", lengthOrHip: "77", sleeveOrInseam: "66" },
          ],
    tip: "Mide el contorno de tu pecho en la parte más amplia manteniendo la cinta métrica horizontal.",
  };
}

// El catálogo de productos vive en la API (NestJS backend).
// Esta lista local fue eliminada — usa fetchProducts/fetchProductBySlug de api.ts.
const _PRODUCTS_REMOVED: Product[] = [
  {
    id: "p-001",
    slug: "camisa-poplin-blanca",
    name: "Camisa de popelín blanca",
    brand: "ARShop Studio",
    price: 420000,
    currency: "COP",
    gender: "hombre",
    category: "camisas",
    images: [img("p001-a"), img("p001-b"), img("p001-c")],
    colors: [
      { name: "Blanco", hex: "#ffffff" },
      { name: "Carbón", hex: "#222222" },
    ],
    sizes: ["S", "M", "L", "XL"],
    description:
      "Corte recto en popelín de algodón 100%. Cuello italiano, puños ajustados. Confección atemporal pensada para durar.",
  },
  {
    id: "p-002",
    slug: "camiseta-caja-algodon",
    name: "Camiseta de corte caja",
    brand: "ARShop Studio",
    price: 230000,
    currency: "COP",
    gender: "hombre",
    category: "camisetas",
    images: [img("p002-a"), img("p002-b"), img("p002-c")],
    colors: [
      { name: "Hueso", hex: "#f5f0e6" },
      { name: "Carbón", hex: "#222222" },
    ],
    sizes: ["XS", "S", "M", "L", "XL"],
    description:
      "Punto de algodón pesado con costura reforzada. Silueta boxy, hombro caído.",
  },
  {
    id: "p-003",
    slug: "pantalon-recto-lana",
    name: "Pantalón recto en lana fría",
    brand: "ARShop Studio",
    price: 690000,
    currency: "COP",
    gender: "hombre",
    category: "pantalones",
    images: [img("p003-a"), img("p003-b"), img("p003-c")],
    colors: [
      { name: "Grafito", hex: "#3a3a3a" },
      { name: "Negro", hex: "#111111" },
    ],
    sizes: ["46", "48", "50", "52"],
    description:
      "Pernera recta con pliegue plano. Mezcla de lana virgen y mohair.",
  },
  {
    id: "p-004",
    slug: "zapato-derby-pulido",
    name: "Zapato Derby pulido",
    brand: "ARShop Studio",
    price: 1120000,
    currency: "COP",
    gender: "hombre",
    category: "calzado",
    images: [img("p004-a"), img("p004-b"), img("p004-c")],
    colors: [{ name: "Negro", hex: "#111111" }],
    sizes: ["40", "41", "42", "43", "44", "45"],
    description:
      "Horma clásica en piel de ternera pulida con suela de cuero cosida Blake.",
  },
  {
    id: "p-005",
    slug: "top-crepe-fluido",
    name: "Top en crepé fluido",
    brand: "ARShop Studio",
    price: 445000,
    currency: "COP",
    gender: "mujer",
    category: "tops",
    images: [img("p005-a"), img("p005-b"), img("p005-c")],
    colors: [
      { name: "Marfil", hex: "#f6f1e7" },
      { name: "Negro", hex: "#111111" },
    ],
    sizes: ["XS", "S", "M", "L"],
    description: "Crepé de viscosa de caída fluida. Escote redondo, sin mangas.",
  },
  {
    id: "p-006",
    slug: "camisa-oversize-mujer",
    name: "Camisa oversize de algodón",
    brand: "ARShop Studio",
    price: 510000,
    currency: "COP",
    gender: "mujer",
    category: "camisas",
    images: [img("p006-a"), img("p006-b"), img("p006-c")],
    colors: [
      { name: "Blanco", hex: "#ffffff" },
      { name: "Humo", hex: "#e6e6e6" },
    ],
    sizes: ["XS", "S", "M", "L"],
    description: "Silueta amplia con hombro caído y botones de nácar.",
  },
  {
    id: "p-007",
    slug: "pantalon-pinzas-mujer",
    name: "Pantalón de pinzas",
    brand: "ARShop Studio",
    price: 605000,
    currency: "COP",
    gender: "mujer",
    category: "pantalones",
    images: [img("p007-a"), img("p007-b"), img("p007-c")],
    colors: [{ name: "Negro", hex: "#111111" }],
    sizes: ["34", "36", "38", "40", "42"],
    description:
      "Cintura alta, pinzas al frente, pernera recta. Lana ligera elástica.",
  },
  {
    id: "p-008",
    slug: "mocasin-piel-mujer",
    name: "Mocasín de piel",
    brand: "ARShop Studio",
    price: 935000,
    currency: "COP",
    gender: "mujer",
    category: "calzado",
    images: [img("p008-a"), img("p008-b"), img("p008-c")],
    colors: [{ name: "Negro", hex: "#111111" }],
    sizes: ["36", "37", "38", "39", "40", "41"],
    description: "Horma redondeada en piel napa suave. Suela de goma mate.",
  },
  {
    id: "p-009",
    slug: "camiseta-rib-mujer",
    name: "Camiseta en punto rib",
    brand: "ARShop Studio",
    price: 275000,
    currency: "COP",
    gender: "mujer",
    category: "camisetas",
    images: [img("p009-a"), img("p009-b"), img("p009-c")],
    colors: [
      { name: "Blanco", hex: "#ffffff" },
      { name: "Negro", hex: "#111111" },
    ],
    sizes: ["XS", "S", "M", "L"],
    description: "Punto rib fino. Cuello redondo y manga corta ajustada.",
  },
  {
    id: "p-010",
    slug: "set-ropa-interior-algodon",
    name: "Conjunto de algodón orgánico",
    brand: "ARShop Studio",
    price: 210000,
    currency: "COP",
    gender: "mujer",
    category: "ropa-interior",
    images: [img("p010-a"), img("p010-b"), img("p010-c")],
    colors: [
      { name: "Hueso", hex: "#f5f0e6" },
      { name: "Negro", hex: "#111111" },
    ],
    sizes: ["XS", "S", "M", "L"],
    description:
      "Conjunto de dos piezas en algodón orgánico GOTS. Elástico plano, costuras planas.",
  },
  {
    id: "p-011",
    slug: "boxer-algodon-hombre",
    name: "Pack de bóxers de algodón",
    brand: "ARShop Studio",
    price: 185000,
    currency: "COP",
    gender: "hombre",
    category: "ropa-interior",
    images: [img("p011-a"), img("p011-b"), img("p011-c")],
    colors: [
      { name: "Blanco", hex: "#ffffff" },
      { name: "Carbón", hex: "#222222" },
    ],
    sizes: ["S", "M", "L", "XL"],
    description:
      "Pack de tres bóxers en algodón peinado. Cintura con logotipo discreto.",
  },

  // ═════════════════ HOMBRE · CAMISAS ═════════════════
  {
    id: "p-012",
    slug: "camisa-oxford-azul",
    name: "Camisa Oxford azul claro",
    brand: "ARShop Studio",
    price: 395000,
    currency: "COP",
    gender: "hombre",
    category: "camisas",
    images: [img("p012-a"), img("p012-b"), img("p012-c")],
    colors: [
      { name: "Azul claro", hex: "#c9d6e3" },
      { name: "Blanco", hex: "#ffffff" },
    ],
    sizes: ["S", "M", "L", "XL"],
    description:
      "Oxford de algodón doble torcido. Cuello button-down, pliegue en espalda.",
  },
  {
    id: "p-013",
    slug: "camisa-lino-crudo",
    name: "Camisa de lino crudo",
    brand: "ARShop Studio",
    price: 445000,
    currency: "COP",
    gender: "hombre",
    category: "camisas",
    images: [img("p013-a"), img("p013-b"), img("p013-c")],
    colors: [
      { name: "Crudo", hex: "#eae3d2" },
      { name: "Grafito", hex: "#3a3a3a" },
    ],
    sizes: ["S", "M", "L", "XL"],
    description:
      "Lino belga 100%. Caída fluida, cuello italiano, puños sin pliegue.",
  },
  {
    id: "p-014",
    slug: "camisa-denim-slim",
    name: "Camisa denim slim",
    brand: "ARShop Studio",
    price: 460000,
    currency: "COP",
    gender: "hombre",
    category: "camisas",
    images: [img("p014-a"), img("p014-b"), img("p014-c")],
    colors: [{ name: "Índigo lavado", hex: "#4a5a74" }],
    sizes: ["S", "M", "L", "XL"],
    description:
      "Chambray 6 oz, costura reforzada, dos bolsillos de pecho con botón.",
  },
  {
    id: "p-015",
    slug: "camisa-cuello-mao",
    name: "Camisa cuello mao de algodón",
    brand: "ARShop Studio",
    price: 410000,
    currency: "COP",
    gender: "hombre",
    category: "camisas",
    images: [img("p015-a"), img("p015-b"), img("p015-c")],
    colors: [
      { name: "Blanco", hex: "#ffffff" },
      { name: "Negro", hex: "#111111" },
    ],
    sizes: ["S", "M", "L", "XL"],
    description:
      "Cuello mao bajo, sin bolsillos. Algodón mercerizado de tacto suave.",
  },

  // ═════════════════ HOMBRE · CAMISETAS ═════════════════
  {
    id: "p-016",
    slug: "camiseta-pima-manga-larga",
    name: "Camiseta pima manga larga",
    brand: "ARShop Studio",
    price: 265000,
    currency: "COP",
    gender: "hombre",
    category: "camisetas",
    images: [img("p016-a"), img("p016-b"), img("p016-c")],
    colors: [
      { name: "Blanco", hex: "#ffffff" },
      { name: "Carbón", hex: "#222222" },
      { name: "Humo", hex: "#e6e6e6" },
    ],
    sizes: ["XS", "S", "M", "L", "XL"],
    description:
      "Algodón pima peruano. Puño ajustado, cuello redondo plano.",
  },
  {
    id: "p-017",
    slug: "camiseta-rayas-breton",
    name: "Camiseta rayas Breton",
    brand: "ARShop Studio",
    price: 285000,
    currency: "COP",
    gender: "hombre",
    category: "camisetas",
    images: [img("p017-a"), img("p017-b"), img("p017-c")],
    colors: [{ name: "Blanco/Negro", hex: "#f5f5f5" }],
    sizes: ["S", "M", "L", "XL"],
    description:
      "Clásica marinera francesa en jersey compacto. 21 rayas tradicionales.",
  },
  {
    id: "p-018",
    slug: "camiseta-bolsillo-relaxed",
    name: "Camiseta bolsillo relaxed",
    brand: "ARShop Studio",
    price: 215000,
    currency: "COP",
    gender: "hombre",
    category: "camisetas",
    images: [img("p018-a"), img("p018-b"), img("p018-c")],
    colors: [
      { name: "Hueso", hex: "#f5f0e6" },
      { name: "Negro", hex: "#111111" },
    ],
    sizes: ["S", "M", "L", "XL"],
    description: "Corte amplio, bolsillo de parche al pecho. Algodón pesado.",
  },
  {
    id: "p-019",
    slug: "polo-pique-liso",
    name: "Polo piqué liso",
    brand: "ARShop Studio",
    price: 310000,
    currency: "COP",
    gender: "hombre",
    category: "camisetas",
    images: [img("p019-a"), img("p019-b"), img("p019-c")],
    colors: [
      { name: "Blanco", hex: "#ffffff" },
      { name: "Grafito", hex: "#3a3a3a" },
    ],
    sizes: ["S", "M", "L", "XL"],
    description:
      "Punto piqué de algodón, placket de dos botones de nácar, apertura lateral.",
  },

  // ═════════════════ HOMBRE · PANTALONES ═════════════════
  {
    id: "p-020",
    slug: "pantalon-chino-caqui",
    name: "Pantalón chino caqui",
    brand: "ARShop Studio",
    price: 480000,
    currency: "COP",
    gender: "hombre",
    category: "pantalones",
    images: [img("p020-a"), img("p020-b"), img("p020-c")],
    colors: [
      { name: "Caqui", hex: "#a99773" },
      { name: "Carbón", hex: "#222222" },
    ],
    sizes: ["46", "48", "50", "52"],
    description: "Twill de algodón prelavado. Corte slim recto, trabilla trasera.",
  },
  {
    id: "p-021",
    slug: "jean-straight-indigo",
    name: "Jean straight índigo",
    brand: "ARShop Studio",
    price: 540000,
    currency: "COP",
    gender: "hombre",
    category: "pantalones",
    images: [img("p021-a"), img("p021-b"), img("p021-c")],
    colors: [{ name: "Índigo", hex: "#2b3a5a" }],
    sizes: ["46", "48", "50", "52"],
    description:
      "Denim japonés selvedge 13 oz. Costura dorada, botón de latón sin pulir.",
  },
  {
    id: "p-022",
    slug: "jogger-tecnico-sarga",
    name: "Jogger técnico sarga",
    brand: "ARShop Studio",
    price: 420000,
    currency: "COP",
    gender: "hombre",
    category: "pantalones",
    images: [img("p022-a"), img("p022-b"), img("p022-c")],
    colors: [
      { name: "Negro", hex: "#111111" },
      { name: "Grafito", hex: "#3a3a3a" },
    ],
    sizes: ["S", "M", "L", "XL"],
    description:
      "Sarga técnica con elastano, cintura con cordón plano, puño reforzado.",
  },
  {
    id: "p-023",
    slug: "pantalon-ancho-lino",
    name: "Pantalón ancho de lino",
    brand: "ARShop Studio",
    price: 580000,
    currency: "COP",
    gender: "hombre",
    category: "pantalones",
    images: [img("p023-a"), img("p023-b"), img("p023-c")],
    colors: [
      { name: "Hueso", hex: "#f5f0e6" },
      { name: "Negro", hex: "#111111" },
    ],
    sizes: ["46", "48", "50", "52"],
    description: "Lino irlandés, caída amplia desde la cadera, dobladillo abierto.",
  },

  // ═════════════════ HOMBRE · CALZADO ═════════════════
  {
    id: "p-024",
    slug: "bota-chelsea-cuero",
    name: "Bota chelsea de cuero",
    brand: "ARShop Studio",
    price: 1290000,
    currency: "COP",
    gender: "hombre",
    category: "calzado",
    images: [img("p024-a"), img("p024-b"), img("p024-c")],
    colors: [{ name: "Negro", hex: "#111111" }],
    sizes: ["40", "41", "42", "43", "44", "45"],
    description:
      "Horma elástica lateral. Piel de ternera encerada, suela de goma Vibram.",
  },
  {
    id: "p-025",
    slug: "mocasin-penny-loafer",
    name: "Mocasín penny loafer",
    brand: "ARShop Studio",
    price: 980000,
    currency: "COP",
    gender: "hombre",
    category: "calzado",
    images: [img("p025-a"), img("p025-b"), img("p025-c")],
    colors: [
      { name: "Marrón", hex: "#5c3a26" },
      { name: "Negro", hex: "#111111" },
    ],
    sizes: ["40", "41", "42", "43", "44", "45"],
    description:
      "Clásico penny en piel de becerro. Suela de cuero cosida y hormada.",
  },
  {
    id: "p-026",
    slug: "zapatilla-minimalista",
    name: "Zapatilla minimalista blanca",
    brand: "ARShop Studio",
    price: 720000,
    currency: "COP",
    gender: "hombre",
    category: "calzado",
    images: [img("p026-a"), img("p026-b"), img("p026-c")],
    colors: [{ name: "Blanco", hex: "#ffffff" }],
    sizes: ["40", "41", "42", "43", "44", "45"],
    description:
      "Napa italiana sin ornamentos. Suela plana cosida, forro de cuero.",
  },
  {
    id: "p-027",
    slug: "sandalia-cuero-hombre",
    name: "Sandalia de cuero plantilla moldeada",
    brand: "ARShop Studio",
    price: 650000,
    currency: "COP",
    gender: "hombre",
    category: "calzado",
    images: [img("p027-a"), img("p027-b"), img("p027-c")],
    colors: [
      { name: "Tostado", hex: "#8a6a4b" },
      { name: "Negro", hex: "#111111" },
    ],
    sizes: ["40", "41", "42", "43", "44", "45"],
    description: "Dos tiras ajustables con hebilla, suela de corcho forrada en cuero.",
  },

  // ═════════════════ HOMBRE · ROPA INTERIOR ═════════════════
  {
    id: "p-028",
    slug: "camiseta-interior-rib",
    name: "Camiseta interior rib",
    brand: "ARShop Studio",
    price: 165000,
    currency: "COP",
    gender: "hombre",
    category: "ropa-interior",
    images: [img("p028-a"), img("p028-b"), img("p028-c")],
    colors: [
      { name: "Blanco", hex: "#ffffff" },
      { name: "Negro", hex: "#111111" },
    ],
    sizes: ["S", "M", "L", "XL"],
    description:
      "Punto rib 1x1 ajustado al cuerpo. Cuello redondo bajo, sin etiqueta externa.",
  },
  {
    id: "p-029",
    slug: "boxer-brief-microfibra",
    name: "Bóxer brief microfibra",
    brand: "ARShop Studio",
    price: 215000,
    currency: "COP",
    gender: "hombre",
    category: "ropa-interior",
    images: [img("p029-a"), img("p029-b"), img("p029-c")],
    colors: [
      { name: "Negro", hex: "#111111" },
      { name: "Grafito", hex: "#3a3a3a" },
      { name: "Humo", hex: "#e6e6e6" },
    ],
    sizes: ["S", "M", "L", "XL"],
    description:
      "Microfibra transpirable con elastano. Cintura ancha sin costura.",
  },
  {
    id: "p-030",
    slug: "pack-calcetines-ejecutivos",
    name: "Pack de calcetines ejecutivos",
    brand: "ARShop Studio",
    price: 150000,
    currency: "COP",
    gender: "hombre",
    category: "ropa-interior",
    images: [img("p030-a"), img("p030-b"), img("p030-c")],
    colors: [{ name: "Carbón", hex: "#222222" }],
    sizes: ["Único"],
    description:
      "Pack de cinco pares en hilo de Escocia mercerizado. Costura plana en el dedo.",
  },
  {
    id: "p-031",
    slug: "camiseta-termal-segunda-piel",
    name: "Camiseta termal segunda piel",
    brand: "ARShop Studio",
    price: 290000,
    currency: "COP",
    gender: "hombre",
    category: "ropa-interior",
    images: [img("p031-a"), img("p031-b"), img("p031-c")],
    colors: [
      { name: "Negro", hex: "#111111" },
      { name: "Hueso", hex: "#f5f0e6" },
    ],
    sizes: ["S", "M", "L", "XL"],
    description:
      "Punto merino + viscosa. Manga larga, cuello alto, costuras planas.",
  },

  // ═════════════════ MUJER · CAMISAS ═════════════════
  {
    id: "p-032",
    slug: "camisa-seda-oscura",
    name: "Camisa de seda carbón",
    brand: "ARShop Studio",
    price: 560000,
    currency: "COP",
    gender: "mujer",
    category: "camisas",
    images: [img("p032-a"), img("p032-b"), img("p032-c")],
    colors: [{ name: "Carbón", hex: "#222222" }],
    sizes: ["XS", "S", "M", "L"],
    description:
      "Seda de crepé mate. Caída fluida, puños con un solo botón concealed.",
  },
  {
    id: "p-033",
    slug: "blusa-tunecina-lino",
    name: "Blusa tunecina de lino",
    brand: "ARShop Studio",
    price: 445000,
    currency: "COP",
    gender: "mujer",
    category: "camisas",
    images: [img("p033-a"), img("p033-b"), img("p033-c")],
    colors: [
      { name: "Hueso", hex: "#f5f0e6" },
      { name: "Humo", hex: "#e6e6e6" },
    ],
    sizes: ["XS", "S", "M", "L"],
    description:
      "Escote en V con cordón de lino, mangas largas con elástico. Lino lavado.",
  },
  {
    id: "p-034",
    slug: "camisa-popelin-fit",
    name: "Camisa de popelín fit",
    brand: "ARShop Studio",
    price: 420000,
    currency: "COP",
    gender: "mujer",
    category: "camisas",
    images: [img("p034-a"), img("p034-b"), img("p034-c")],
    colors: [
      { name: "Blanco", hex: "#ffffff" },
      { name: "Negro", hex: "#111111" },
    ],
    sizes: ["XS", "S", "M", "L", "XL"],
    description:
      "Popelín egipcio compacto. Corte ajustado a la cintura, cuello italiano.",
  },
  {
    id: "p-035",
    slug: "camisa-pajama-cuello-amplio",
    name: "Camisa pajama cuello amplio",
    brand: "ARShop Studio",
    price: 475000,
    currency: "COP",
    gender: "mujer",
    category: "camisas",
    images: [img("p035-a"), img("p035-b"), img("p035-c")],
    colors: [
      { name: "Hueso", hex: "#f5f0e6" },
      { name: "Carbón", hex: "#222222" },
    ],
    sizes: ["XS", "S", "M", "L"],
    description:
      "Satén de algodón. Cuello amplio tipo pajama, bolsillo de pecho con pespunte.",
  },

  // ═════════════════ MUJER · CAMISETAS ═════════════════
  {
    id: "p-036",
    slug: "camiseta-manga-larga-basica",
    name: "Camiseta manga larga básica",
    brand: "ARShop Studio",
    price: 235000,
    currency: "COP",
    gender: "mujer",
    category: "camisetas",
    images: [img("p036-a"), img("p036-b"), img("p036-c")],
    colors: [
      { name: "Blanco", hex: "#ffffff" },
      { name: "Negro", hex: "#111111" },
      { name: "Humo", hex: "#e6e6e6" },
    ],
    sizes: ["XS", "S", "M", "L"],
    description: "Punto fino de algodón pima. Puños ajustados y cuello redondo bajo.",
  },
  {
    id: "p-037",
    slug: "camiseta-oversize-vintage",
    name: "Camiseta oversize vintage",
    brand: "ARShop Studio",
    price: 265000,
    currency: "COP",
    gender: "mujer",
    category: "camisetas",
    images: [img("p037-a"), img("p037-b"), img("p037-c")],
    colors: [
      { name: "Hueso", hex: "#f5f0e6" },
      { name: "Carbón", hex: "#222222" },
    ],
    sizes: ["S", "M", "L", "XL"],
    description:
      "Jersey vintage pesado y lavado. Hombros caídos, dobladillo abierto.",
  },
  {
    id: "p-038",
    slug: "camiseta-cropped",
    name: "Camiseta cropped",
    brand: "ARShop Studio",
    price: 195000,
    currency: "COP",
    gender: "mujer",
    category: "camisetas",
    images: [img("p038-a"), img("p038-b"), img("p038-c")],
    colors: [
      { name: "Blanco", hex: "#ffffff" },
      { name: "Negro", hex: "#111111" },
    ],
    sizes: ["XS", "S", "M", "L"],
    description: "Punto fino. Largo cropped, hombro caído, dobladillo plano.",
  },
  {
    id: "p-039",
    slug: "polo-tenis-manga-corta",
    name: "Polo tenis manga corta",
    brand: "ARShop Studio",
    price: 290000,
    currency: "COP",
    gender: "mujer",
    category: "camisetas",
    images: [img("p039-a"), img("p039-b"), img("p039-c")],
    colors: [
      { name: "Blanco", hex: "#ffffff" },
      { name: "Negro", hex: "#111111" },
    ],
    sizes: ["XS", "S", "M", "L"],
    description:
      "Punto piqué de algodón. Cuello polo, placket mini de tres botones.",
  },

  // ═════════════════ MUJER · TOPS ═════════════════
  {
    id: "p-040",
    slug: "top-halter-saten",
    name: "Top halter satén",
    brand: "ARShop Studio",
    price: 410000,
    currency: "COP",
    gender: "mujer",
    category: "tops",
    images: [img("p040-a"), img("p040-b"), img("p040-c")],
    colors: [
      { name: "Marfil", hex: "#f6f1e7" },
      { name: "Negro", hex: "#111111" },
    ],
    sizes: ["XS", "S", "M", "L"],
    description: "Satén de viscosa. Cuello halter atado al cuello, espalda abierta.",
  },
  {
    id: "p-041",
    slug: "top-tirantes-seda-lavada",
    name: "Top tirantes seda lavada",
    brand: "ARShop Studio",
    price: 480000,
    currency: "COP",
    gender: "mujer",
    category: "tops",
    images: [img("p041-a"), img("p041-b"), img("p041-c")],
    colors: [
      { name: "Hueso", hex: "#f5f0e6" },
      { name: "Carbón", hex: "#222222" },
    ],
    sizes: ["XS", "S", "M", "L"],
    description:
      "Seda lavada 90gsm. Tirantes finos regulables, escote ribeteado al bies.",
  },
  {
    id: "p-042",
    slug: "top-bustier-estructurado",
    name: "Top bustier estructurado",
    brand: "ARShop Studio",
    price: 540000,
    currency: "COP",
    gender: "mujer",
    category: "tops",
    images: [img("p042-a"), img("p042-b"), img("p042-c")],
    colors: [{ name: "Negro", hex: "#111111" }],
    sizes: ["XS", "S", "M", "L"],
    description:
      "Cuerpo bustier con ballenas internas. Cremallera invisible lateral.",
  },
  {
    id: "p-043",
    slug: "top-corse-moderno",
    name: "Top corsé moderno",
    brand: "ARShop Studio",
    price: 495000,
    currency: "COP",
    gender: "mujer",
    category: "tops",
    images: [img("p043-a"), img("p043-b"), img("p043-c")],
    colors: [
      { name: "Marfil", hex: "#f6f1e7" },
      { name: "Negro", hex: "#111111" },
    ],
    sizes: ["XS", "S", "M", "L"],
    description:
      "Satén técnico con costuras moldeadas. Cordón ajustable en la espalda.",
  },

  // ═════════════════ MUJER · PANTALONES ═════════════════
  {
    id: "p-044",
    slug: "jean-mom-alto-indigo",
    name: "Jean mom cintura alta",
    brand: "ARShop Studio",
    price: 520000,
    currency: "COP",
    gender: "mujer",
    category: "pantalones",
    images: [img("p044-a"), img("p044-b"), img("p044-c")],
    colors: [{ name: "Índigo", hex: "#2b3a5a" }],
    sizes: ["34", "36", "38", "40", "42"],
    description:
      "Denim no-stretch 12 oz. Mom fit clásico, dobladillo abierto a tijera.",
  },
  {
    id: "p-045",
    slug: "pantalon-palazzo-lino",
    name: "Pantalón palazzo de lino",
    brand: "ARShop Studio",
    price: 560000,
    currency: "COP",
    gender: "mujer",
    category: "pantalones",
    images: [img("p045-a"), img("p045-b"), img("p045-c")],
    colors: [
      { name: "Hueso", hex: "#f5f0e6" },
      { name: "Negro", hex: "#111111" },
    ],
    sizes: ["34", "36", "38", "40", "42"],
    description:
      "Lino belga ligero. Caída palazzo, cintura con pliegues frontales.",
  },
  {
    id: "p-046",
    slug: "legging-termico-sport",
    name: "Legging térmico sport",
    brand: "ARShop Studio",
    price: 420000,
    currency: "COP",
    gender: "mujer",
    category: "pantalones",
    images: [img("p046-a"), img("p046-b"), img("p046-c")],
    colors: [{ name: "Negro", hex: "#111111" }],
    sizes: ["XS", "S", "M", "L", "XL"],
    description: "Punto térmico de alta recuperación. Costura flatlock, cintura ancha.",
  },
  {
    id: "p-047",
    slug: "pantalon-cargo-utilitario",
    name: "Pantalón cargo utilitario",
    brand: "ARShop Studio",
    price: 495000,
    currency: "COP",
    gender: "mujer",
    category: "pantalones",
    images: [img("p047-a"), img("p047-b"), img("p047-c")],
    colors: [
      { name: "Caqui", hex: "#a99773" },
      { name: "Carbón", hex: "#222222" },
    ],
    sizes: ["34", "36", "38", "40", "42"],
    description:
      "Twill de algodón con bolsillos laterales de fuelle. Cintura ajustable.",
  },

  // ═════════════════ MUJER · CALZADO ═════════════════
  {
    id: "p-048",
    slug: "bota-alta-cuero",
    name: "Bota alta de cuero",
    brand: "ARShop Studio",
    price: 1350000,
    currency: "COP",
    gender: "mujer",
    category: "calzado",
    images: [img("p048-a"), img("p048-b"), img("p048-c")],
    colors: [{ name: "Negro", hex: "#111111" }],
    sizes: ["36", "37", "38", "39", "40", "41"],
    description:
      "Caña alta en piel napa. Cremallera lateral invisible, tacón bloque bajo.",
  },
  {
    id: "p-049",
    slug: "zapatilla-deportiva-minimal",
    name: "Zapatilla deportiva minimal",
    brand: "ARShop Studio",
    price: 695000,
    currency: "COP",
    gender: "mujer",
    category: "calzado",
    images: [img("p049-a"), img("p049-b"), img("p049-c")],
    colors: [{ name: "Blanco", hex: "#ffffff" }],
    sizes: ["36", "37", "38", "39", "40", "41"],
    description: "Napa lisa sin logotipo. Suela plana cosida, interior acolchado.",
  },
  {
    id: "p-050",
    slug: "sandalia-tira-plana",
    name: "Sandalia tira plana",
    brand: "ARShop Studio",
    price: 480000,
    currency: "COP",
    gender: "mujer",
    category: "calzado",
    images: [img("p050-a"), img("p050-b"), img("p050-c")],
    colors: [
      { name: "Tostado", hex: "#8a6a4b" },
      { name: "Negro", hex: "#111111" },
    ],
    sizes: ["36", "37", "38", "39", "40", "41"],
    description: "Una sola tira ancha, suela de goma mate, plantilla moldeada.",
  },
  {
    id: "p-051",
    slug: "zapato-mary-jane",
    name: "Zapato Mary Jane",
    brand: "ARShop Studio",
    price: 795000,
    currency: "COP",
    gender: "mujer",
    category: "calzado",
    images: [img("p051-a"), img("p051-b"), img("p051-c")],
    colors: [
      { name: "Negro", hex: "#111111" },
      { name: "Marfil", hex: "#f6f1e7" },
    ],
    sizes: ["36", "37", "38", "39", "40", "41"],
    description:
      "Horma redonda baja, tira al empeine con hebilla fina. Suela de cuero.",
  },

  // ═════════════════ MUJER · ROPA INTERIOR ═════════════════
  {
    id: "p-052",
    slug: "brasier-sin-aros-deportivo",
    name: "Brasier sin aros deportivo",
    brand: "ARShop Studio",
    price: 265000,
    currency: "COP",
    gender: "mujer",
    category: "ropa-interior",
    images: [img("p052-a"), img("p052-b"), img("p052-c")],
    colors: [
      { name: "Negro", hex: "#111111" },
      { name: "Hueso", hex: "#f5f0e6" },
    ],
    sizes: ["XS", "S", "M", "L"],
    description:
      "Tejido técnico de alta recuperación. Soporte medio, sin costuras laterales.",
  },
  {
    id: "p-053",
    slug: "panty-culotte-seamless",
    name: "Panty culotte seamless",
    brand: "ARShop Studio",
    price: 165000,
    currency: "COP",
    gender: "mujer",
    category: "ropa-interior",
    images: [img("p053-a"), img("p053-b"), img("p053-c")],
    colors: [
      { name: "Negro", hex: "#111111" },
      { name: "Hueso", hex: "#f5f0e6" },
      { name: "Humo", hex: "#e6e6e6" },
    ],
    sizes: ["XS", "S", "M", "L"],
    description:
      "Microfibra sin costuras. Cintura ancha plana, acabado láser en bordes.",
  },
  {
    id: "p-054",
    slug: "baby-doll-saten-lavado",
    name: "Baby doll de satén lavado",
    brand: "ARShop Studio",
    price: 395000,
    currency: "COP",
    gender: "mujer",
    category: "ropa-interior",
    images: [img("p054-a"), img("p054-b"), img("p054-c")],
    colors: [
      { name: "Marfil", hex: "#f6f1e7" },
      { name: "Negro", hex: "#111111" },
    ],
    sizes: ["XS", "S", "M", "L"],
    description:
      "Satén lavado con caída fluida. Tirantes finos, ribete al bies.",
  },
  {
    id: "p-055",
    slug: "body-manga-larga-algodon",
    name: "Body manga larga de algodón",
    brand: "ARShop Studio",
    price: 310000,
    currency: "COP",
    gender: "mujer",
    category: "ropa-interior",
    images: [img("p055-a"), img("p055-b"), img("p055-c")],
    colors: [
      { name: "Blanco", hex: "#ffffff" },
      { name: "Carbón", hex: "#222222" },
    ],
    sizes: ["XS", "S", "M", "L"],
    description:
      "Punto fino de algodón con elastano. Cuello redondo, broches en entrepierna.",
  },
];

// Suppresses TS unused variable warning for the removed PRODUCTS list above
void _PRODUCTS_REMOVED;

export function formatPrice(value: number, currency: "COP" = "COP") {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function getCategoriesForGender(gender: Gender) {
  return CATEGORIES.filter((c) => c.genders.includes(gender));
}
