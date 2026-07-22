import "server-only";

import { createHash, randomBytes } from "node:crypto";
import sharp from "sharp";
import { getAddress, isAddress, verifyMessage, type Address, type Hex } from "viem";
import {
  TOKEN_IMAGE_MAX_BYTES,
  canonicalMetadataCommitment,
  validateTokenMetadataInput,
  type TokenMetadataInput,
} from "@/lib/token-metadata";

const CHALLENGE_TTL_MS = 5 * 60 * 1_000;
const CHALLENGE_RATE_WINDOW_MS = 10 * 60 * 1_000;
const UPLOAD_RATE_WINDOW_MS = 60 * 60 * 1_000;
const MAX_CHALLENGES_PER_WINDOW = 12;
const MAX_UPLOADS_PER_WINDOW = 6;
const PINATA_UPLOAD_URL = process.env.NODE_ENV === "production"
  ? "https://uploads.pinata.cloud/v3/files"
  : process.env.PINATA_UPLOAD_URL ?? "https://uploads.pinata.cloud/v3/files";

type Challenge = {
  address: Address;
  commitment: Hex;
  message: string;
  expiresAt: number;
};

type RateEntry = { startedAt: number; count: number };
type UploadState = {
  challenges: Map<string, Challenge>;
  rates: Map<string, RateEntry>;
};

declare global {
  var __arcOriginMetadataUploadState: UploadState | undefined;
}

const state = globalThis.__arcOriginMetadataUploadState ?? {
  challenges: new Map(),
  rates: new Map(),
};
globalThis.__arcOriginMetadataUploadState = state;

export class MetadataUploadError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export function metadataUploadAvailable() {
  return Boolean(process.env.PINATA_JWT?.trim());
}

function consumeRate(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const entry = state.rates.get(key);
  if (!entry || now - entry.startedAt >= windowMs) {
    state.rates.set(key, { startedAt: now, count: 1 });
    return;
  }
  if (entry.count >= limit) throw new MetadataUploadError("Upload rate limit reached. Try again later.", 429);
  entry.count += 1;
}

function cleanupChallenges() {
  const now = Date.now();
  for (const [nonce, challenge] of state.challenges) {
    if (challenge.expiresAt <= now) state.challenges.delete(nonce);
  }
  if (state.challenges.size > 500) {
    const oldest = state.challenges.keys().next().value as string | undefined;
    if (oldest) state.challenges.delete(oldest);
  }
}

export function createMetadataChallenge(rawAddress: string, rawCommitment: string, clientKey: string) {
  if (!metadataUploadAvailable()) throw new MetadataUploadError("Token media storage is not configured yet.", 503);
  if (!isAddress(rawAddress)) throw new MetadataUploadError("Connect a valid wallet before uploading metadata.");
  if (!/^0x[0-9a-fA-F]{64}$/.test(rawCommitment)) throw new MetadataUploadError("Invalid metadata commitment.");
  consumeRate(`challenge:${clientKey}`, MAX_CHALLENGES_PER_WINDOW, CHALLENGE_RATE_WINDOW_MS);
  cleanupChallenges();

  const address = getAddress(rawAddress);
  const commitment = rawCommitment.toLowerCase() as Hex;
  const nonce = randomBytes(18).toString("hex");
  const expiresAt = Date.now() + CHALLENGE_TTL_MS;
  const message = [
    "ArcOrigin token metadata upload",
    `Wallet: ${address}`,
    `Metadata: ${commitment}`,
    `Nonce: ${nonce}`,
    `Expires: ${new Date(expiresAt).toISOString()}`,
    "This signature authorizes one public IPFS upload and no blockchain transaction.",
  ].join("\n");
  state.challenges.set(nonce, { address, commitment, message, expiresAt });
  return { nonce, message, expiresAt };
}

export async function authorizeMetadataUpload({
  nonce,
  address,
  commitment,
  signature,
  clientKey,
}: {
  nonce: string;
  address: string;
  commitment: string;
  signature: string;
  clientKey: string;
}) {
  cleanupChallenges();
  const challenge = state.challenges.get(nonce);
  if (!challenge || challenge.expiresAt <= Date.now()) throw new MetadataUploadError("Upload authorization expired. Sign again.", 401);
  if (!isAddress(address) || getAddress(address) !== challenge.address) throw new MetadataUploadError("Upload wallet does not match the signature.", 401);
  if (commitment.toLowerCase() !== challenge.commitment) throw new MetadataUploadError("Token metadata changed after signing.", 401);
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) throw new MetadataUploadError("Invalid wallet signature.", 401);

  const valid = await verifyMessage({
    address: challenge.address,
    message: challenge.message,
    signature: signature as Hex,
  });
  if (!valid) throw new MetadataUploadError("Wallet signature could not be verified.", 401);

  state.challenges.delete(nonce);
  consumeRate(`upload:wallet:${challenge.address.toLowerCase()}`, MAX_UPLOADS_PER_WINDOW, UPLOAD_RATE_WINDOW_MS);
  consumeRate(`upload:client:${clientKey}`, MAX_UPLOADS_PER_WINDOW, UPLOAD_RATE_WINDOW_MS);
  return challenge.address;
}

export function sha256Hex(bytes: Uint8Array) {
  return `0x${createHash("sha256").update(bytes).digest("hex")}`;
}

export function calculateMetadataCommitment(input: TokenMetadataInput, imageSha256: string) {
  const normalized = validateTokenMetadataInput(input);
  return `0x${createHash("sha256").update(canonicalMetadataCommitment(normalized, imageSha256)).digest("hex")}` as Hex;
}

export function validateImage(file: File | null, bytes: Uint8Array | null) {
  if (!file || !bytes) return;
  if (file.size <= 0 || file.size > TOKEN_IMAGE_MAX_BYTES) throw new MetadataUploadError("Optimized image must be 2 MB or smaller.");
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new MetadataUploadError("Use a PNG, JPG, or WebP image.");
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!(jpeg || png || webp)) throw new MetadataUploadError("The uploaded file is not a valid PNG, JPG, or WebP image.");
}

export async function normalizeUploadedImage(bytes: Uint8Array) {
  try {
    const output = await sharp(bytes, { failOn: "warning", limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 84, effort: 4 })
      .toBuffer();
    if (output.length <= 0 || output.length > TOKEN_IMAGE_MAX_BYTES) {
      throw new MetadataUploadError("The normalized image is larger than 2 MB.");
    }
    return new File([output], "token-image.webp", { type: "image/webp" });
  } catch (error) {
    if (error instanceof MetadataUploadError) throw error;
    throw new MetadataUploadError("The image could not be safely decoded.");
  }
}

function safeFileStem(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "token";
}

async function uploadToPinata(file: File, displayName: string) {
  const jwt = process.env.PINATA_JWT?.trim();
  if (!jwt) throw new MetadataUploadError("Token media storage is not configured yet.", 503);
  const body = new FormData();
  body.append("file", file);
  body.append("network", "public");
  body.append("name", displayName);
  let response: Response;
  try {
    response = await fetch(PINATA_UPLOAD_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body,
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new MetadataUploadError("IPFS upload timed out. Try again.", 502);
  }
  const payload = await response.json().catch(() => null) as { data?: { cid?: string } } | null;
  const cid = payload?.data?.cid;
  if (!response.ok || !cid || !/^[A-Za-z0-9]{40,120}$/.test(cid)) {
    throw new MetadataUploadError("IPFS storage rejected the upload. Try again.", 502);
  }
  return cid;
}

export async function publishTokenMetadata({
  input,
  creator,
  image,
}: {
  input: TokenMetadataInput;
  creator: Address;
  image: File | null;
}) {
  const normalized = validateTokenMetadataInput(input);
  const stem = safeFileStem(`${normalized.name}-${normalized.symbol}`);
  let imageURI = "";
  if (image) {
    const extension = image.type === "image/png" ? "png" : image.type === "image/jpeg" ? "jpg" : "webp";
    const imageCid = await uploadToPinata(image, `${stem}.${extension}`);
    imageURI = `ipfs://${imageCid}`;
  }
  const metadata = {
    name: normalized.name,
    symbol: normalized.symbol,
    description: normalized.description,
    ...(imageURI ? { image: imageURI } : {}),
    ...(normalized.website ? { external_url: normalized.website } : {}),
    attributes: [
      { trait_type: "Network", value: "Arc Testnet" },
      { trait_type: "Launchpad", value: "ArcOrigin" },
    ],
    properties: {
      creator,
      standard: "ArcOrigin Token Metadata v1",
      ...(normalized.website ? { website: normalized.website } : {}),
      ...(normalized.x ? { x: normalized.x } : {}),
    },
  };
  const metadataFile = new File([JSON.stringify(metadata)], `${stem}.json`, { type: "application/json" });
  const metadataCid = await uploadToPinata(metadataFile, `${stem}.json`);
  return {
    metadataURI: `ipfs://${metadataCid}`,
    imageURI,
    gatewayURL: `https://gateway.pinata.cloud/ipfs/${metadataCid}`,
  };
}
