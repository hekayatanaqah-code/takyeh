/** Minimal storage metadata contract shared by GCS and the standalone adapter. */
export interface StorageMetadata {
  contentType?: string;
  size?: string | number;
  generation?: string | number;
  metadata?: Record<string,string|number|boolean|null>;
}
export interface AclFile {
  name: string;
  exists(): Promise<[boolean,...unknown[]]>;
  getMetadata(): Promise<[StorageMetadata,...unknown[]]>;
  setMetadata(value:{metadata:Record<string,string>}): Promise<unknown>;
}
