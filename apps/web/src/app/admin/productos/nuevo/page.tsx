"use client";

import { useRouter } from "next/navigation";
import { ProductAdminForm } from "@/components/product-admin-form";
import { apiAdminCreateProduct, type AdminProductInput } from "@/lib/api";

export default function NewProductPage() {
  const router = useRouter();

  const handleCreate = async (dto: AdminProductInput) => {
    await apiAdminCreateProduct(dto);
    router.push("/admin/productos");
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="caption uppercase tracking-wider text-graphite text-[11px]">
          Admin · Productos
        </p>
        <h2 className="font-serif text-2xl text-carbon mt-1">Nuevo producto</h2>
      </div>
      <ProductAdminForm onSubmit={handleCreate} submitLabel="Crear producto" />
    </div>
  );
}
