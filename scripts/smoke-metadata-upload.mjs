import { createHash } from "node:crypto";
import sharp from "sharp";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const baseURL = process.env.METADATA_SMOKE_BASE_URL ?? "http://127.0.0.1:3107";
const account = privateKeyToAccount(generatePrivateKey());
const input = {
  name: "Origin Upload Smoke",
  symbol: "OUS",
  description: "Integration test profile for the ArcOrigin token metadata upload flow.",
  website: "https://arcorigin.xyz/",
  x: "https://x.com/arcorigin",
};
const image = await sharp({
  create: { width: 64, height: 64, channels: 4, background: { r: 34, g: 211, b: 238, alpha: 1 } },
}).webp({ quality: 80 }).toBuffer();
const imageSha256 = `0x${createHash("sha256").update(image).digest("hex")}`;
const canonical = JSON.stringify({ ...input, imageSha256 });
const commitment = `0x${createHash("sha256").update(canonical).digest("hex")}`;

function uploadForm(nonce, signature) {
  const form = new FormData();
  form.append("nonce", nonce);
  form.append("address", account.address);
  form.append("signature", signature);
  for (const [key, value] of Object.entries(input)) form.append(key, value);
  form.append("image", new File([new Uint8Array(image)], "token-image.webp", { type: "image/webp" }));
  return form;
}

const statusResponse = await fetch(`${baseURL}/api/metadata/status`, { cache: "no-store" });
const status = await statusResponse.json();
if (!statusResponse.ok || status.available !== true) throw new Error("Metadata upload is not available in the smoke environment.");

const crossOriginResponse = await fetch(`${baseURL}/api/metadata/challenge`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: "https://attacker.invalid" },
  body: JSON.stringify({ address: account.address, commitment }),
});
if (crossOriginResponse.status !== 403) throw new Error(`Expected cross-origin challenge rejection, received ${crossOriginResponse.status}.`);

const challengeResponse = await fetch(`${baseURL}/api/metadata/challenge`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: baseURL },
  body: JSON.stringify({ address: account.address, commitment }),
});
const challenge = await challengeResponse.json();
if (!challengeResponse.ok || !challenge.nonce || !challenge.message) {
  throw new Error(challenge.error ?? "Could not create an upload challenge.");
}
const signature = await account.signMessage({ message: challenge.message });

const uploadResponse = await fetch(`${baseURL}/api/metadata/upload`, {
  method: "POST",
  headers: { Origin: baseURL },
  body: uploadForm(challenge.nonce, signature),
});
const upload = await uploadResponse.json();
if (!uploadResponse.ok || !String(upload.metadataURI).startsWith("ipfs://") || !String(upload.imageURI).startsWith("ipfs://")) {
  throw new Error(upload.error ?? "Metadata upload did not return IPFS URIs.");
}

const replayResponse = await fetch(`${baseURL}/api/metadata/upload`, {
  method: "POST",
  headers: { Origin: baseURL },
  body: uploadForm(challenge.nonce, signature),
});
if (replayResponse.status !== 401) throw new Error(`Expected one-time signature replay rejection, received ${replayResponse.status}.`);

console.log(`Metadata upload smoke passed for ${account.address}: ${upload.metadataURI}`);
