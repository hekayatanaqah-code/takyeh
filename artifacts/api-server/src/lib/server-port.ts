/** Use the hosting service's port, never a fixed fallback or a second server. */
export function serverPort(raw: string | undefined): number {
  if (!raw || !/^\d+$/.test(raw)) {
    throw new Error("Invalid PORT: hosting must supply an integer between 1 and 65535.");
  }
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Invalid PORT: hosting must supply an integer between 1 and 65535.");
  }
  return port;
}
