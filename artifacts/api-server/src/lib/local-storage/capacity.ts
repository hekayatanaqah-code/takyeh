const MIB=1024*1024;
const RESERVE_BYTES=64*MIB;

export class StorageCapacityError extends Error {
  readonly code="UPLOAD_STORAGE_FULL";
  constructor(readonly availableBytes:number,readonly requiredBytes:number){
    super("Insufficient storage space.");
    this.name="StorageCapacityError";
  }
}

export function assertUploadCapacity(stats:{bavail:number;bsize:number;blocks:number},limit:number,expectedBytes?:number):void{
  const availableBytes=Math.max(0,stats.bavail*stats.bsize);
  // Content-Length is already bounded by the signed ticket at ingress.
  // Do not reserve the maximum permitted upload for a smaller, known file.
  const uploadBytes=expectedBytes===undefined?Math.min(limit,64*MIB):expectedBytes;
  if(!Number.isSafeInteger(uploadBytes)||uploadBytes<0||uploadBytes>limit)
    throw Object.assign(new Error("Invalid upload length."),{status:400});
  const requiredBytes=uploadBytes+RESERVE_BYTES;
  if(availableBytes<requiredBytes)throw new StorageCapacityError(availableBytes,requiredBytes);
}
