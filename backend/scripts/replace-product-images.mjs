#!/usr/bin/env node
/**
 * Reemplaza las imágenes de todos los productos en Supabase por fotos de
 * Unsplash verificadas (todos los IDs confirmados HTTP 200 contra
 * images.unsplash.com) y curadas por (gender, category).
 *
 * Rotación por slug: cada producto recibe 5 fotos tomadas del pool
 * empezando en un offset derivado del slug, para que productos de la
 * misma categoría no muestren fotos idénticas.
 *
 * Uso:  node --env-file=.env scripts/replace-product-images.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

const url = process.env.SUPABASE_URL?.replace(/^"|"$/g, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/^"|"$/g, "");
if (!url || !key) {
  console.error("Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en env.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const qp = "?w=800&h=1000&fit=crop&auto=format&q=80";
const base = "https://images.unsplash.com/photo-";
const u = (id) => base + id + qp;

/**
 * Pools curados por (gender|category). Cada ID verificado contra Unsplash
 * y descrito con lo que muestra la foto. Puedes editar libremente.
 */
const POOLS = {
  // Camisas de vestir masculinas, button-ups
  "hombre|camisas": [
    u("1621072156002-e2fccdc0b176"), // Hombre con camisa blanca de vestir
    u("1602810316693-3667c854239a"), // Camisa azul button-up en mesa
    u("1624835567150-0c530a20d8cc"), // Hombre con camisa azul y pantalón negro
    u("1594938291221-94f18cbb5660"), // Camisa de rayas azul y blanco
    u("1603252110481-7ba873bf42ab"), // Camisa blanco/púrpura button-up
    u("1642764873649-5c228ce3fe74"), // Variedad de camisas de hombre sobre cama
    u("1596755094514-f87e34085b2c"), // Camisa blanca
    u("1602810318383-e386cc2a3ccf"), // Camisa detalle
  ],
  // Camisetas masculinas
  "hombre|camisetas": [
    u("1581655353564-df123a1eb820"), // Camiseta blanca cuello redondo en exhibición
    u("1521572163474-6864f9cf17ab"), // Hombre con camiseta blanca
    u("1562157873-818bc0726f68"),    // Camisetas dobladas en madera
    u("1605949405965-d49ada3f9189"), // Camiseta amarilla cuello redondo
    u("1571455786673-9d9d6c194f90"), // Hombre con camiseta negra
    u("1594672830234-ba4cfe1202dc"), // Hombre con camiseta turquesa
  ],
  // Pantalones masculinos
  "hombre|pantalones": [
    u("1718252540511-e958742e4165"), // Jeans negros sobre piso blanco
    u("1718252540558-7b383b52642e"), // Jeans negros producto
    u("1473966968600-fa801b869a1a"), // Hombre con denim marrón
    u("1624835567150-0c530a20d8cc"), // Pantalón negro de vestir
    u("1601561446301-fecc99036f4b"), // Pantalón casual marrón + sneakers
    u("1655666730043-b3aee96aa161"), // Detalle de bolsillo denim
    u("1584865288642-42078afe6942"), // Hombre con pantalón negro
  ],
  // Calzado masculino
  "hombre|calzado": [
    u("1549298916-b41d501d3772"),    // Sneaker Nike marrón en textil amarillo
    u("1560769629-975ec94e6a86"),    // Sneakers blancos sobre caja
    u("1668069226492-508742b03147"), // Zapatos negros formales
    u("1603191659812-ee978eeeef76"), // Zapatos de cuero marrón con cordones
    u("1616406432452-07bc5938759d"), // Mocasines marrón en tela azul
    u("1605733160314-4fc7dac4bb16"), // Botas marrón close-up
  ],
  // Ropa interior masculina — pool neutro (prendas básicas/dobladas)
  "hombre|ropa-interior": [
    u("1700659392887-0a026c53f8e2"), // Estante con camisas dobladas
    u("1548768041-2fceab4c0b85"),    // Tres camisas cuello V oscuras
    u("1713881630214-82c44407cf25"), // Tres camisetas apiladas
    u("1562157873-818bc0726f68"),    // Camisetas dobladas
    u("1581655353564-df123a1eb820"), // Camiseta blanca en percha
    u("1594672830234-ba4cfe1202dc"), // Camiseta básica
  ],

  // Camisas / blusas femeninas
  "mujer|camisas": [
    u("1665065952009-a5dc00f423d4"), // Camisa blanca
    u("1680690517143-d813ac08cd13"), // Mujer con camisa y pantalón blanco
    u("1611235116156-0cbda6649efb"), // Mujer con button-up blanca
    u("1770294758906-c8762abb2c8b"), // Camisa sin mangas blanca
    u("1761117228880-df2425bd70da"), // Blusa roja
    u("1789110521592-044c58391f7f"), // Blusa floral roja con lazo
    u("1764337593519-c51a77b4fc3d"), // Blusa floral vibrante
  ],
  // Camisetas femeninas
  "mujer|camisetas": [
    u("1618354691373-d851c5c3a990"), // Camiseta negra cuello redondo
    u("1620799139507-2a76f79a2f4d"), // Camiseta blanca cuello redondo
    u("1759572095384-1a7e646d0d4f"), // Dos camisetas producto (negro + verde)
    u("1618677603286-0ec56cb6e1b5"), // Camiseta blanca variante
    u("1564584217132-2271feaeb3c5"), // Camiseta gris sobre pared blanca
    u("1716951988375-37d5793385d0"), // Pila de 5 camisetas
  ],
  // Pantalones / jeans femeninos
  "mujer|pantalones": [
    u("1637069585336-827b298fe84a"), // Pila de jeans producto
    u("1714143136372-ddaf8b606da7"), // Un par de jeans sobre fondo blanco
    u("1542272604-787c3835535d"),    // Variedad denim multicolor
    u("1714143136367-7bb68f3f0669"), // Detalle trasero de jeans
    u("1605518216938-7c31b7b14ad0"), // Denim sobre superficie contrastante
    u("1714143164072-7646ef5cb24d"), // Jeans azul oscuro flat lay
    u("1551854838-212c50b4c184"),    // Pantalón naranja
  ],
  // Calzado femenino
  "mujer|calzado": [
    u("1543163521-1bf539c55dd2"),    // Pumps florales
    u("1535043934128-cf0b28d52f95"), // Tacones blancos texturizados
    u("1621996659490-3275b4d0d951"), // Tacones marrón peep toe
    u("1784127616777-b8bd2536bbf8"), // Botas vaqueras en estante
    u("1515347619252-60a4bf4fff4f"), // Stilettos negros
    u("1768225286074-9039931bb9d3"), // Zapatillas atléticas en estante
    u("1519415943484-9fa1873496d4"), // Colección surtida de calzado femenino
  ],
  // Tops femeninos (crop, camisoles, bustiers)
  "mujer|tops": [
    u("1537223419767-a8e6d78e27b8"), // Mujer con crop top
    u("1789110519894-e56e4db1f0c1"), // Mujer con crop blanco + sweatpants
    u("1787057856910-b8f0a170d988"), // Dos mujeres crop tops blancos
    u("1760551733073-dd140353506b"), // Crop top + chaqueta
    u("1538406641397-91f410ec4ec2"), // Crop sudadera (grayscale)
    u("1760551600405-54c70e6d7f42"), // Camisa marrón casual
  ],
  // Ropa interior femenina — pool neutro de textiles/básicos dobladas
  "mujer|ropa-interior": [
    u("1760013531865-89ff324f83a6"), // Pila de suéteres neutros doblados
    u("1524404886881-0beaa13c7b78"), // Textiles organizados en canasta
    u("1630329273801-8f629dba0a72"), // Textiles rosa/azul/blanco
    u("1700659392887-0a026c53f8e2"), // Estante con prendas dobladas
    u("1548768041-2fceab4c0b85"),    // Tres cuellos V oscuros doblados
    u("1618354691373-d851c5c3a990"), // Camiseta negra básica
  ],
};

/** Hash determinista → entero no negativo. */
function slugOffset(slug, poolSize) {
  const h = createHash("sha1").update(slug).digest();
  return h[0] % poolSize;
}

/** Toma 5 URLs del pool empezando en `offset`, con wrap-around. */
function rotate(pool, offset, count = 5) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(pool[(offset + i) % pool.length]);
  }
  return out;
}

const { data: products, error } = await supabase
  .from("products")
  .select("id, slug, gender, category");

if (error) {
  console.error("Error cargando productos:", error.message);
  process.exit(1);
}

console.log(`Encontrados ${products.length} productos.`);

let updated = 0;
let skipped = 0;
for (const p of products) {
  const key = `${p.gender}|${p.category}`;
  const pool = POOLS[key];
  if (!pool) {
    console.warn(`  · sin pool para ${key} (${p.slug}) — se omite`);
    skipped++;
    continue;
  }
  const offset = slugOffset(p.slug, pool.length);
  const images = rotate(pool, offset, 5);
  const { error: uErr } = await supabase
    .from("products")
    .update({ images })
    .eq("id", p.id);
  if (uErr) {
    console.error(`  ✗ ${p.slug}: ${uErr.message}`);
    skipped++;
  } else {
    updated++;
  }
}

console.log(`\nListo. Actualizados: ${updated} · Omitidos: ${skipped}`);
