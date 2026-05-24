import { ProductCard } from "@/components/ProductCard";
import { prisma } from "@/lib/prisma";
import type { ProductDTO } from "@/lib/schemas";

export const dynamic = "force-dynamic";

async function getProducts(): Promise<ProductDTO[]> {
  const products = await prisma.product.findMany({
    include: {
      stockLevels: { include: { warehouse: true } },
    },
    orderBy: { name: "asc" },
  });

  return products.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    imageUrl: p.imageUrl,
    price: p.price,
    stockLevels: p.stockLevels.map((s) => ({
      warehouseId: s.warehouseId,
      warehouseName: s.warehouse.name,
      totalUnits: s.totalUnits,
      reservedUnits: s.reservedUnits,
      availableUnits: Math.max(0, s.totalUnits - s.reservedUnits),
    })),
  }));
}

export default async function HomePage() {
  let products: ProductDTO[] = [];
  let error: string | null = null;

  try {
    products = await getProducts();
  } catch {
    error = "Could not load products. Is the database connected?";
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)] mb-1">
          Products
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Select a product and warehouse to reserve inventory.
        </p>
      </div>
      {error && (
        <div className="bg-[var(--danger-bg)] border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-8">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
}