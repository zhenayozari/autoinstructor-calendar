import { createECDH } from "node:crypto";

function toBase64Url(buffer: Buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

const ecdh = createECDH("prime256v1");
ecdh.generateKeys();

console.log("NEXT_PUBLIC_VAPID_PUBLIC_KEY=" + toBase64Url(ecdh.getPublicKey()));
console.log("VAPID_PRIVATE_KEY=" + toBase64Url(ecdh.getPrivateKey()));
console.log("VAPID_SUBJECT=mailto:owner@example.com");
