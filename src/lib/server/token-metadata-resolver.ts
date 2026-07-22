import "server-only";

import { normalizeWebsiteUrl, normalizeXUrl } from "@/lib/token-metadata";

const MAX_METADATA_BYTES = 64 * 1024;
const CACHE_LIMIT = 200;
const SUCCESS_CACHE_TTL_MS = 60 * 60 * 1_000;
const FAILURE_CACHE_TTL_MS = 60 * 1_000;

export type ResolvedTokenMetadata = {
  description?: string;
  image?: string;
  website?: string;
  x?: string;
};

declare global {
  var __arcOriginResolvedMetadata: Map<string, { value: ResolvedTokenMetadata | null; cachedAt: number }> | undefined;
}

const cache = globalThis.__arcOriginResolvedMetadata ?? new Map<string, { value: ResolvedTokenMetadata | null; cachedAt: number }>();
globalThis.__arcOriginResolvedMetadata = cache;

function parseIpfsPath(uri: string) {
  const match = uri.trim().match(/^ipfs:\/\/(?:ipfs\/)?([A-Za-z0-9]{40,120})(\/[^?#]*)?$/);
  if (!match || match[2]?.split("/").includes("..")) return null;
  return `${match[1]}${match[2] ?? ""}`;
}

function gatewayBase() {
  const configured = process.env.IPFS_GATEWAY_URL?.trim();
  if (!configured) return "https://gateway.pinata.cloud/ipfs/";
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:") return "https://gateway.pinata.cloud/ipfs/";
    return `${url.toString().replace(/\/+$/, "")}/`;
  } catch {
    return "https://gateway.pinata.cloud/ipfs/";
  }
}

export function ipfsGatewayURL(uri: string) {
  const path = parseIpfsPath(uri);
  return path ? `${gatewayBase()}${path}` : "";
}

function text(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLength
    ? value.trim()
    : undefined;
}

function cacheMetadata(key: string, value: ResolvedTokenMetadata | null) {
  if (cache.size >= CACHE_LIMIT && !cache.has(key)) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { value, cachedAt: Date.now() });
}

async function readLimitedBody(response: Response) {
  if (!response.body) throw new Error("Metadata response has no body.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_METADATA_BYTES) {
      await reader.cancel();
      throw new Error("Metadata is too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export async function resolveTokenMetadata(metadataURI: string): Promise<ResolvedTokenMetadata | null> {
  if (!metadataURI) return null;
  const cached = cache.get(metadataURI);
  if (cached) {
    const ttl = cached.value ? SUCCESS_CACHE_TTL_MS : FAILURE_CACHE_TTL_MS;
    if (Date.now() - cached.cachedAt < ttl) return cached.value;
    cache.delete(metadataURI);
  }
  const url = ipfsGatewayURL(metadataURI);
  if (!url) return null;

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(6_000),
    });
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (!response.ok || (contentLength > 0 && contentLength > MAX_METADATA_BYTES)) throw new Error("Invalid metadata response.");
    const body = await readLimitedBody(response);
    const payload = JSON.parse(body) as Record<string, unknown>;
    const properties = payload.properties && typeof payload.properties === "object"
      ? payload.properties as Record<string, unknown>
      : {};
    const imageURI = text(payload.image, 512) ?? "";
    const websiteValue = text(payload.external_url, 200) ?? text(properties.website, 200) ?? "";
    const xValue = text(properties.x, 200) ?? "";
    const result: ResolvedTokenMetadata = {
      description: text(payload.description, 500),
      image: imageURI ? ipfsGatewayURL(imageURI) || undefined : undefined,
      website: websiteValue ? normalizeWebsiteUrl(websiteValue) : undefined,
      x: xValue ? normalizeXUrl(xValue) : undefined,
    };
    cacheMetadata(metadataURI, result);
    return result;
  } catch {
    cacheMetadata(metadataURI, null);
    return null;
  }
}
