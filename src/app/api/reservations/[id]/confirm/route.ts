import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { ReservationDTO } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw
        Array<{
          id: string;
          status: string;
          expires_at: Date;
          product_id: string;
          warehouse_id: string;
          quantity: number;
        }>
      >`
        SELECT id, status, "expiresAt" AS expires_at, "productId" AS product_id,
               "warehouseId" AS warehouse_id, quantity
        FROM "Reservation"
        WHERE id = ${id}
        FOR UPDATE
      `;

      if (rows.length === 0) return { type: "NOT_FOUND" as const };
      const res = rows[0];
      if (res.status === "CONFIRMED") return { type: "ALREADY_CONFIRMED" as const };
      if (res.status === "RELEASED") return { type: "ALREADY_RELEASED" as const };

      if (new Date(res.expires_at) < new Date()) {
        await tx.$executeRaw`
          UPDATE "StockLevel"
          SET "reservedUnits" = "reservedUnits" - ${res.quantity}
          WHERE "productId" = ${res.product_id} AND "warehouseId" = ${res.warehouse_id}
        `;
        await tx.reservation.update({ where: { id }, data: { status: "RELEASED" } });
        return { type: "EXPIRED" as const };
      }

      await tx.$executeRaw`
        UPDATE "StockLevel"
        SET "totalUnits" = "totalUnits" - ${res.quantity},
            "reservedUnits" = "reservedUnits" - ${res.quantity}
        WHERE "productId" = ${res.product_id} AND "warehouseId" = ${res.warehouse_id}
      `;

      const updated = await tx.reservation.update({
        where: { id },
        data: { status: "CONFIRMED" },
        include: { product: true, warehouse: true },
      });

      return { type: "OK" as const, reservation: updated };
    });

    if (result.type === "NOT_FOUND") return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
    if (result.type === "EXPIRED") return NextResponse.json({ error: "Reservation has expired" }, { status: 410 });
    if (result.type === "ALREADY_RELEASED") return NextResponse.json({ error: "Already released" }, { status: 410 });
    if (result.type === "ALREADY_CONFIRMED") return NextResponse.json({ message: "Already confirmed" });

    const r = (result as { type: "OK"; reservation: NonNullable<unknown> & { id: string; productId: string; product: { name: string; price: number }; warehouseId: string; warehouse: { name: string }; quantity: number; status: string; expiresAt: Date; createdAt: Date } }).reservation;
    const dto: ReservationDTO = {
      id: r.id,
      productId: r.productId,
      productName: r.product.name,
      productPrice: r.product.price,
      warehouseId: r.warehouseId,
      warehouseName: r.warehouse.name,
      quantity: r.quantity,
      status: r.status as ReservationDTO["status"],
      expiresAt: r.expiresAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
    };
    return NextResponse.json(dto);
  } catch (err) {
    console.error(`[POST /api/reservations/${id}/confirm]`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}