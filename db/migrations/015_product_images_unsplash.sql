-- ═══════════════════════════════════════════════════════════════════════════
-- Reemplaza las imágenes picsum (grises) por fotos reales de Unsplash
-- curadas por (gender, category). Cinco vistas por producto.
--
-- Idempotente: se puede re-ejecutar sin problema; sobreescribe `images`
-- en todos los productos existentes de cada combinación.
--
-- Para añadir variedad entre productos del mismo grupo, edita manualmente
-- las URLs después de correr este archivo o duplica el bloque UPDATE con
-- WHERE slug IN (...).
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  -- Parámetros Unsplash: 800×1000 portrait, fit crop, calidad 80, auto format.
  qp text := '?w=800&h=1000&fit=crop&auto=format&q=80';
  base text := 'https://images.unsplash.com/photo-';

  -- Pools por (gender, category). Cada array = 5 URLs → 5 vistas por producto.
  m_camisas  text[];
  m_camisetas text[];
  m_pantalones text[];
  m_calzado  text[];
  m_tops     text[];
  m_interior text[];
  h_camisas  text[];
  h_camisetas text[];
  h_pantalones text[];
  h_calzado  text[];
  h_interior text[];
BEGIN
  m_camisas := ARRAY[
    base || '1490481651871-ab68de25d43d' || qp,
    base || '1544022613-e87ca75a784a'    || qp,
    base || '1515886657613-9f3515b0c78f' || qp,
    base || '1485462537746-965f33f7f6a7' || qp,
    base || '1551803091-e20673f15770'    || qp
  ];

  m_camisetas := ARRAY[
    base || '1551803091-e20673f15770'    || qp,
    base || '1485462537746-965f33f7f6a7' || qp,
    base || '1434389677669-e08b4cac3105' || qp,
    base || '1544022613-e87ca75a784a'    || qp,
    base || '1515886657613-9f3515b0c78f' || qp
  ];

  m_pantalones := ARRAY[
    base || '1551232864-3f0890e580d9'    || qp,
    base || '1612336307429-8a898d10e223' || qp,
    base || '1562572159-4efc207f5aff'    || qp,
    base || '1620799140408-edc6dcb6d633' || qp,
    base || '1624378439575-d8705ad7ae80' || qp
  ];

  m_calzado := ARRAY[
    base || '1595950653106-6c9ebd614d3a' || qp,
    base || '1549298916-b41d501d3772'    || qp,
    base || '1600185365483-26d7a4cc7519' || qp,
    base || '1512374382149-233c42b6a83b' || qp,
    base || '1543163521-1bf539c55dd2'    || qp
  ];

  m_tops := ARRAY[
    base || '1515886657613-9f3515b0c78f' || qp,
    base || '1485462537746-965f33f7f6a7' || qp,
    base || '1551803091-e20673f15770'    || qp,
    base || '1434389677669-e08b4cac3105' || qp,
    base || '1490481651871-ab68de25d43d' || qp
  ];

  m_interior := ARRAY[
    base || '1583394838336-acd977736f90' || qp,
    base || '1618354691373-d851c5c3a990' || qp,
    base || '1572635196237-14b3f281503f' || qp,
    base || '1591047139829-d91aecb6caea' || qp,
    base || '1620012253295-c15cc3e65df4' || qp
  ];

  h_camisas := ARRAY[
    base || '1596755094514-f87e34085b2c' || qp,
    base || '1602810318383-e386cc2a3ccf' || qp,
    base || '1617137968427-85924c800a22' || qp,
    base || '1507003211169-0a1dd7228f2d' || qp,
    base || '1521572163474-6864f9cf17ab' || qp
  ];

  h_camisetas := ARRAY[
    base || '1521572163474-6864f9cf17ab' || qp,
    base || '1583743814966-8936f5b7be1a' || qp,
    base || '1611312449408-fcece27cdbb7' || qp,
    base || '1507003211169-0a1dd7228f2d' || qp,
    base || '1596755094514-f87e34085b2c' || qp
  ];

  h_pantalones := ARRAY[
    base || '1473966968600-fa801b869a1a' || qp,
    base || '1624378439575-d8705ad7ae80' || qp,
    base || '1620799140408-edc6dcb6d633' || qp,
    base || '1562572159-4efc207f5aff'    || qp,
    base || '1612336307429-8a898d10e223' || qp
  ];

  h_calzado := ARRAY[
    base || '1549298916-b41d501d3772'    || qp,
    base || '1512374382149-233c42b6a83b' || qp,
    base || '1600185365483-26d7a4cc7519' || qp,
    base || '1543163521-1bf539c55dd2'    || qp,
    base || '1595950653106-6c9ebd614d3a' || qp
  ];

  h_interior := ARRAY[
    base || '1620012253295-c15cc3e65df4' || qp,
    base || '1611042553365-9b101441c135' || qp,
    base || '1591047139829-d91aecb6caea' || qp,
    base || '1521572163474-6864f9cf17ab' || qp,
    base || '1583743814966-8936f5b7be1a' || qp
  ];

  -- Mujer
  UPDATE public.products SET images = m_camisas    WHERE gender = 'mujer'  AND category = 'camisas';
  UPDATE public.products SET images = m_camisetas  WHERE gender = 'mujer'  AND category = 'camisetas';
  UPDATE public.products SET images = m_pantalones WHERE gender = 'mujer'  AND category = 'pantalones';
  UPDATE public.products SET images = m_calzado    WHERE gender = 'mujer'  AND category = 'calzado';
  UPDATE public.products SET images = m_tops       WHERE gender = 'mujer'  AND category = 'tops';
  UPDATE public.products SET images = m_interior   WHERE gender = 'mujer'  AND category = 'ropa-interior';

  -- Hombre
  UPDATE public.products SET images = h_camisas    WHERE gender = 'hombre' AND category = 'camisas';
  UPDATE public.products SET images = h_camisetas  WHERE gender = 'hombre' AND category = 'camisetas';
  UPDATE public.products SET images = h_pantalones WHERE gender = 'hombre' AND category = 'pantalones';
  UPDATE public.products SET images = h_calzado    WHERE gender = 'hombre' AND category = 'calzado';
  UPDATE public.products SET images = h_interior   WHERE gender = 'hombre' AND category = 'ropa-interior';
END $$;
