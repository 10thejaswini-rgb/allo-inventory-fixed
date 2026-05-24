import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { ProductDTO } from "@/lib/schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const products = await prisma.product.findMany({
      include: {
        stockLevels: {
          include: { warehouse: true },
        },
      },
      orderBy: { name: "asc" },
    });

    const response: ProductDTO[] = products.map((p) => ({
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

    return NextResponse.json(response);
  } catch (err) {
    console.error("[GET /api/products]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}