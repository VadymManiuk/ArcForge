import { NextResponse } from "next/server";
import { metadataUploadAvailable } from "@/lib/server/metadata-upload";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ available: metadataUploadAvailable() }, {
    headers: { "Cache-Control": "no-store" },
  });
}
