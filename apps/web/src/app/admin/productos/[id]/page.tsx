"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ProductAdminForm } from "@/components/product-admin-form";
import {
  apiAdminUpdateProduct,
  fetchAdminProduct,
  type AdminProduct,
  type AdminProductInput,
} from "@/lib/api";

export default function EditProductPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [product, setProduct] = useState<AdminProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const id = params.id;
    if (!id) return;
    fetchAdminProduct(id)
      .then(setProduct)
      .catch((err) => setError(err?.message || "Error cargando producto."))
      .finally(() => setLoading(false));
  }, [params.id]);

  const handleUpdate = async (dto: AdminProductInput) => {
    if (!product) return;
    const res = await apiAdminUpdateProduct(product.id, dto);
    if (res.archivedVariants && res.archivedVariants.length > 0) {
      // No navegamos: el admin tiene que ver por qué esas variantes siguen ahí.
      setNotice(
        `Estas variantes tienen pedidos asociados y no se pueden borrar sin romper el histórico; quedaron con stock 0: ${res.archivedVariants.join(", ")}`,
      );
      setProduct(await fetchAdminProduct(product.id));
      return;
    }
    router.push("/admin/productos");
  };

  if (loading) {
    return (
      <div className="py-16 text-center">
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-graphite" />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="border border-smoke p-8 text-center">
        <p className="caption text-carbon">{error || "No encontrado."}</p>
      </div>
    );
  }

  const initial: Partial<AdminProductInput> = {
    slug: product.slug,
    name: product.name,
    brand: product.brand,
    description: product.description,
    gender: product.gender,
    category: product.category,
    priceCop: product.price,
    compareAtPriceCop: product.compareAtPrice ?? null,
    fit: product.fit ?? "regular",
    images: product.images,
    active: product.active,
    variants: (product.variants ?? []).map((v) => ({
      id: v.id,
      size: v.size,
      colorName: v.color_name,
      colorHex: v.color_hex,
      sku: v.sku,
      stock: v.stock,
    })),
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="caption uppercase tracking-wider text-graphite text-[11px]">
          Admin · Productos
        </p>
        <h2 className="font-serif text-2xl text-carbon mt-1">{product.name}</h2>
        <p className="caption text-graphite text-[12px] font-mono mt-1">
          {product.slug}
          {!product.active && " · inactivo"}
        </p>
      </div>
      {notice && (
        <div className="border border-smoke bg-paper p-3 caption text-[12px] text-graphite">
          {notice}
        </div>
      )}
      <ProductAdminForm
        // Re-monta el form con los datos frescos tras guardar.
        key={product.id + (product.variants?.map((v) => v.id).join() ?? "")}
        initial={initial}
        onSubmit={handleUpdate}
        submitLabel="Actualizar producto"
      />
    </div>
  );
}
