import { md5 as digest } from "@noble/hashes/legacy";

export function md5(value: string): string {
  return [...digest(new TextEncoder().encode(value))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
