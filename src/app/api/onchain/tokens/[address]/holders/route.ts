import { NextRequest, NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { FactoryTokenNotFoundError, getHolderSnapshot, isHolderRpcError } from "@/lib/onchain/holder-snapshot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ address: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { address } = await context.params;
  if (!isAddress(address)) return NextResponse.json({ error: "Invalid token address." }, { status: 400 });
  try {
    const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";
    const result = await getHolderSnapshot(getAddress(address), forceRefresh);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, max-age=10, stale-while-revalidate=60" },
    });
  } catch (error) {
    if (error instanceof FactoryTokenNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({
      error: isHolderRpcError(error)
        ? "Arc Testnet RPC is temporarily rate-limited. Retry in a moment."
        : "Holder data could not be indexed from Arc Testnet.",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
