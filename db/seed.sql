-- ═══════════════════════════════════════════════════════════════════════════
-- Seed de catálogo mínimo para pruebas de API.
-- Idempotente: usa ON CONFLICT (slug) do nothing.
-- Para datos reales el admin usa /products CRUD desde el frontend.
-- ═══════════════════════════════════════════════════════════════════════════

-- Fotos de Unsplash curadas por categoría (portrait 800×1000, calidad 80).
-- Para masa de datos ejecuta db/migrations/015_product_images_unsplash.sql
-- después del seed; aquí solo dejamos un mínimo representativo.
insert into public.products (slug, name, brand, description, gender, category, price_cop, images)
values
  ('camisa-poplin-blanca', 'Camisa de popelín blanca', 'ARShop Studio',
   'Corte recto en popelín de algodón 100%. Cuello italiano, puños ajustados.',
   'hombre', 'camisas', 420000,
   array['https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=800&h=1000&fit=crop&auto=format&q=80',
         'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=800&h=1000&fit=crop&auto=format&q=80',
         'https://images.unsplash.com/photo-1617137968427-85924c800a22?w=800&h=1000&fit=crop&auto=format&q=80',
         'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&h=1000&fit=crop&auto=format&q=80',
         'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&h=1000&fit=crop&auto=format&q=80']),
  ('camiseta-caja-algodon', 'Camiseta de corte caja', 'ARShop Studio',
   'Punto de algodón pesado con costura reforzada. Silueta boxy.',
   'hombre', 'camisetas', 230000,
   array['https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&h=1000&fit=crop&auto=format&q=80',
         'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=800&h=1000&fit=crop&auto=format&q=80',
         'https://images.unsplash.com/photo-1611312449408-fcece27cdbb7?w=800&h=1000&fit=crop&auto=format&q=80',
         'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&h=1000&fit=crop&auto=format&q=80',
         'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=800&h=1000&fit=crop&auto=format&q=80']),
  ('pantalon-recto-lana', 'Pantalón recto en lana fría', 'ARShop Studio',
   'Pernera recta con pliegue plano. Mezcla de lana virgen y mohair.',
   'hombre', 'pantalones', 690000,
   array['https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=800&h=1000&fit=crop&auto=format&q=80',
         'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=800&h=1000&fit=crop&auto=format&q=80',
         'https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=800&h=1000&fit=crop&auto=format&q=80',
         'https://images.unsplash.com/photo-1562572159-4efc207f5aff?w=800&h=1000&fit=crop&auto=format&q=80',
         'https://images.unsplash.com/photo-1612336307429-8a898d10e223?w=800&h=1000&fit=crop&auto=format&q=80']),
  ('top-crepe-fluido', 'Top en crepé fluido', 'ARShop Studio',
   'Crepé de viscosa de caída fluida. Escote redondo, sin mangas.',
   'mujer', 'tops', 445000,
   array['https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&h=1000&fit=crop&auto=format&q=80',
         'https://images.unsplash.com/photo-1485462537746-965f33f7f6a7?w=800&h=1000&fit=crop&auto=format&q=80',
         'https://images.unsplash.com/photo-1551803091-e20673f15770?w=800&h=1000&fit=crop&auto=format&q=80',
         'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=800&h=1000&fit=crop&auto=format&q=80',
         'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=800&h=1000&fit=crop&auto=format&q=80']),
  ('camisa-oversize-mujer', 'Camisa oversize de algodón', 'ARShop Studio',
   'Silueta amplia con hombro caído y botones de nácar.',
   'mujer', 'camisas', 510000,
   array['https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=800&h=1000&fit=crop&auto=format&q=80',
         'https://images.unsplash.com/photo-1544022613-e87ca75a784a?w=800&h=1000&fit=crop&auto=format&q=80',
         'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&h=1000&fit=crop&auto=format&q=80',
         'https://images.unsplash.com/photo-1485462537746-965f33f7f6a7?w=800&h=1000&fit=crop&auto=format&q=80',
         'https://images.unsplash.com/photo-1551803091-e20673f15770?w=800&h=1000&fit=crop&auto=format&q=80'])
on conflict (slug) do nothing;

-- Variantes mínimas por producto
insert into public.product_variants (product_id, size, color_name, color_hex, sku, stock)
select p.id, s.size, 'Blanco', '#ffffff',
       p.slug || '-blanco-' || s.size,
       20
from public.products p
cross join (values ('S'), ('M'), ('L'), ('XL')) as s(size)
where p.slug in ('camisa-poplin-blanca', 'camiseta-caja-algodon', 'camisa-oversize-mujer', 'top-crepe-fluido')
on conflict (sku) do nothing;

insert into public.product_variants (product_id, size, color_name, color_hex, sku, stock)
select p.id, s.size, 'Grafito', '#3a3a3a',
       p.slug || '-grafito-' || s.size,
       15
from public.products p
cross join (values ('46'), ('48'), ('50'), ('52')) as s(size)
where p.slug = 'pantalon-recto-lana'
on conflict (sku) do nothing;
