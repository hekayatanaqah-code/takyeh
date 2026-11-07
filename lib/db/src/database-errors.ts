export function isUniqueViolation(error: unknown): boolean {
  let current = error;
  for (let depth=0;depth<6 && current && typeof current==="object";depth++) {
    if ("code" in current && current.code==="23505") return true;
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}
