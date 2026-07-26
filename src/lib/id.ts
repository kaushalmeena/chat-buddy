/**
 * Collision-resistant identifier. Prefers `crypto.randomUUID`, falling back to
 * random bytes for the non-secure contexts where it is undefined.
 */
export function createId(): string {
  // `randomUUID` is unavailable in non-secure contexts, where `getRandomValues`
  // still is — so feature-detect rather than assuming the whole API is present.
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
