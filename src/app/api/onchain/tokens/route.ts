import { NextRequest, NextResponse } from "next/server";
import { getTokenIndexSnapshot, isTokenIndexRpcError } from "@/lib/onchain/token-index-snapshot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";
    const result = await getTokenIndexSnapshot(forceRefresh);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, max-age=10, stale-while-revalidate=60" },
    });
  } catch (error) {
    return NextResponse.json({
      error: isTokenIndexRpcError(error)
        ? "Arc Testnet RPC is temporarily rate-limited. Retry in a moment."
        : "Factory launch data could not be indexed from Arc Testnet.",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
