export function isUniqueViolation(error: unknown): boolean {
  let current = error;
  for (let depth=0;depth<6 && current && typeof current==="object";depth++) {
    if (("errno" in current && current.errno===1062) || ("code" in current && current.code==="ER_DUP_ENTRY")) return true;
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}
