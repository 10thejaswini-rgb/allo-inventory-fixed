// src/app/api/reservations/[id]/confirm/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withIdempotency } from "@/lib/idempotency";
import type { ReservationDTO } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const idempotencyKey = request.headers.get("Idempotency-Key");

  return withIdempotency(
    idempotencyKey,
    `/api/reservations/${id}/confirm`,
    async () => {
      try {
        const result = await prisma.$transaction(async (tx) => {
          // Lock the reservation row
          const rows = await tx.$queryRaw<
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

          if (rows.length === 0) {
            return { type: "NOT_FOUND" as const };
          }

          const res = rows[0];

          if (res.status === "CONFIRMED") {
            return { type: "ALREADY_CONFIRMED" as const, id: res.id };
          }

          if (res.status === "RELEASED") {
            return { type: "ALREADY_RELEASED" as const };
          }

          // Check expiry
          if (new Date(res.expires_at) < new Date()) {
            // Mark as released and restore stock
            await tx.$executeRaw`
              UPDATE "StockLevel"
              SET "reservedUnits" = "reservedUnits" - ${res.quantity},
                  "updatedAt" = now()
              WHERE "productId" = ${res.product_id} AND "warehouseId" = ${res.warehouse_id}
            `;
            await tx.reservation.update({
              where: { id },
              data: { status: "RELEASED" },
            });
            return { type: "EXPIRED" as const };
          }

          // Confirm: decrement total stock and release the reservation hold
          await tx.$executeRaw`
            UPDATE "StockLevel"
            SET "totalUnits" = "totalUnits" - ${res.quantity},
                "reservedUnits" = "reservedUnits" - ${res.quantity},
                "updatedAt" = now()
            WHERE "productId" = ${res.product_id} AND "warehouseId" = ${res.warehouse_id}
          `;

          const updated = await tx.reservation.update({
            where: { id },
            data: { status: "CONFIRMED" },
            include: { product: true, warehouse: true },
          });

          return { type: "OK" as const, reservation: updated };
        });

        if (result.type === "NOT_FOUND") {
          return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
        }

        if (result.type === "EXPIRED") {
          return NextResponse.json(
            { error: "Reservation has expired" },
            { status: 410 }
          );
        }

        if (result.type === "ALREADY_RELEASED") {
          return NextResponse.json(
            { error: "Reservation was already released" },
            { status: 410 }
          );
        }

        const { reservation } = result;
        if (!reservation) {
  return NextResponse.json(
    { error: "Reservation not found" },
    { status: 404 }
  );
}
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
        console.error(`[POST /api/reservations/${id}/confirm]`, err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
      }
    }
  );
}
