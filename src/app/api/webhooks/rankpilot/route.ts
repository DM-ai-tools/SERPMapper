import { NextResponse } from "next/server";

/**
 * This webhook endpoint has been removed.
 * SERPMapper is now a standalone product.
 */
export async function POST() {
  return NextResponse.json({ error: "Endpoint removed" }, { status: 410 });
}
