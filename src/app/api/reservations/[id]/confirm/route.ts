import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { ReservationDTO } from "@/lib/schemas";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  status: string;
  expires_at: Date;
  product_id: string;
  warehouse_id: string;
  quantity: number;
};

type ReservationWithRelations = {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  status: string;
  expiresAt: Date;
  createdAt: Date;
  product: { name: string; price: number };
  warehouse: { name: string };
};

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  try {
    const reservation = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Row[]>`
        SELECT id, status, "expiresAt" AS expires_at, "productId" AS product_id,
               "warehouseId" AS warehouse_id, quantity
        FROM "Reservation"
        WHERE id = ${id}
        FOR UPDATE
      `;

      if (rows.length === 0) throw new Error("NOT_FOUND");
      const res = rows[0];
      if (res.status === "CONFIRMED") throw new Error("ALREADY_CONFIRMED");
      if (res.status === "RELEASED") throw new Error("ALREADY_RELEASED");

      if (new Date(res.expires_at) < new Date()) {
        await tx.$executeRaw`
          UPDATE "StockLevel"
          SET "reservedUnits" = "reservedUnits" - ${res.quantity}
          WHERE "productId" = ${res.product_id} AND "warehouseId" = ${res.warehouse_id}
        `;
        await tx.reservation.update({ where: { id }, data: { status: "RELEASED" } });
        throw new Error("EXPIRED");
      }

      await tx.$executeRaw`
        UPDATE "StockLevel"
        SET "totalUnits" = "totalUnits" - ${res.quantity},
            "reservedUnits" = "reservedUnits" - ${res.quantity}
        WHERE "productId" = ${res.product_id} AND "warehouseId" = ${res.warehouse_id}
      `;

      return await tx.reservation.update({
        where: { id },
        data: { status: "CONFIRMED" },
        include: { product: true, warehouse: true },
      }) as unknown as ReservationWithRelations;
    });

    const dto: ReservationDTO = {
      id: reservation.id,
      productId: reservation.productId,
      productName: reservation.product.name,
      productPrice: reservation.product.price,
      warehouseId: reservation.warehouseId,
      warehouseName: reservation.warehouse.name,
      quantity: reservation.quantity,
      status: reservation.status as ReservationDTO["status"],
      expiresAt: reservation.expiresAt.toISOString(),
      createdAt: reservation.createdAt.toISOString(),
    };

    return NextResponse.json(dto);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "NOT_FOUND") return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
    if (message === "EXPIRED") return NextResponse.json({ error: "Reservation has expired" }, { status: 410 });
    if (message === "ALREADY_RELEASED") return NextResponse.json({ error: "Already released" }, { status: 410 });
    if (message === "ALREADY_CONFIRMED") return NextResponse.json({ message: "Already confirmed" });
    console.error(`[POST /api/reservations/${id}/confirm]`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}