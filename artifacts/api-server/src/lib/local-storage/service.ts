import {createHmac,timingSafeEqual,randomUUID} from "node:crypto";
import {Readable} from "node:stream";
import {LocalFile,ObjectNotFoundError,maximumUploadBytes} from "./files";
import {canAccessObject,getObjectAclPolicy,setObjectAclPolicy,ObjectPermission,type ObjectAclPolicy} from "../objectAcl";
export {ObjectNotFoundError,initializeLocalStorage} from "./files";
export interface Ticket {name:string;expiry:number;max:number;aclPolicy?:ObjectAclPolicy;}
function mac(encoded:string):string{
  const secret=process.env.SESSION_SECRET;
  if(!secret||secret.length<32)throw new Error("Storage signing is not configured.");
  return createHmac("sha256",secret).update(`local-upload:${encoded}`).digest("hex");
}
export function verifyTicket(token:string):Ticket{
  const [encoded,signature,extra]=token.split(".");
  if(extra||!encoded||encoded.length>2500||! /^[a-f0-9]{64}$/.test(signature??"")||
    !timingSafeEqual(Buffer.from(mac(encoded),"hex"),Buffer.from(signature,"hex")))throw new ObjectNotFoundError();
  const value=JSON.parse(Buffer.from(encoded,"base64url").toString()) as Ticket;
  if(!Number.isSafeInteger(value.expiry)||value.expiry<Date.now()||value.expiry>Date.now()+16*60000||
    !Number.isSafeInteger(value.max)||value.max<1||value.max>maximumUploadBytes())throw new ObjectNotFoundError();
  new LocalFile(value.name);
  if(!value.name.startsWith("private/"))throw new ObjectNotFoundError();
  // Only a server holding the signing secret can mint migration policies.
  // Apply them atomically with the bytes, never publish a private import first.
  if(value.aclPolicy!==undefined){
    const policy=value.aclPolicy;
    if(!policy||typeof policy!=="object"||typeof policy.owner!=="string"||
      !policy.owner||policy.owner.length>256||/[\u0000-\u001f\u007f]/.test(policy.owner)||
      !["private","public"].includes(policy.visibility)||
      (policy.aclRules!==undefined&&(!Array.isArray(policy.aclRules)||policy.aclRules.length!==0)))
      throw new ObjectNotFoundError();
  }
  return value;
}
export class ObjectStorageService {
  readonly enforcesObjectAcl=true;
  getPublicObjectSearchPaths(){return["/local/public"];}
  getPrivateObjectDir(){return"/local/private";}
  async searchPublicObject(filePath:string):Promise<LocalFile|null>{
    const file=new LocalFile(`public/${filePath}`);return(await file.exists())[0]?file:null;
  }
  async getObjectEntityFile(objectPath:string):Promise<LocalFile>{
    if(!objectPath.startsWith("/objects/"))throw new ObjectNotFoundError();
    const file=new LocalFile(`private/${objectPath.slice(9)}`);
    if(!(await file.exists())[0])throw new ObjectNotFoundError();return file;
  }
  async getObjectEntityUploadURL(entityPath?:string):Promise<string>{
    const name=`private/${entityPath??`uploads/${randomUUID()}`}`;new LocalFile(name);
    const encoded=Buffer.from(JSON.stringify({name,expiry:Date.now()+15*60000,max:maximumUploadBytes()})).toString("base64url");
    const origin=process.env.PUBLIC_SITE_URL;
    if(!origin)throw new Error("PUBLIC_SITE_URL is required.");
    const url=new URL("/api/storage/local-upload",origin);
    url.searchParams.set("ticket",`${encoded}.${mac(encoded)}`);return url.toString();
  }
  normalizeObjectEntityPath(raw:string):string{
    if(raw.startsWith("/objects/")){new LocalFile(`private/${raw.slice(9)}`);return raw;}
    if(raw.startsWith("/api/storage/objects/"))return this.normalizeObjectEntityPath(raw.slice(12));
    const url=new URL(raw,process.env.PUBLIC_SITE_URL);
    if(url.origin!==new URL(process.env.PUBLIC_SITE_URL!).origin||url.pathname!=="/api/storage/local-upload")
      throw new ObjectNotFoundError();
    return`/objects/${verifyTicket(url.searchParams.get("ticket")??"").name.slice(8)}`;
  }
  async uploadBuffer(bytes:Buffer,contentType:string,extension:string,entityPath?:string):Promise<string>{
    if(! /^[a-z0-9]{1,12}$/.test(extension))throw new Error("Invalid file extension.");
    const entity=entityPath??`uploads/${randomUUID()}.${extension}`;
    await new LocalFile(`private/${entity}`).save(bytes,{contentType});
    return`/api/storage/objects/${entity}`;
  }
  async trySetObjectEntityAclPolicy(raw:string,policy:ObjectAclPolicy):Promise<string>{
    const normalized=this.normalizeObjectEntityPath(raw);
    await setObjectAclPolicy(await this.getObjectEntityFile(normalized),policy);return normalized;
  }
  async canAccessObjectEntity({userId,objectFile,requestedPermission=ObjectPermission.READ}:{
    userId?:string;objectFile:LocalFile;requestedPermission?:ObjectPermission;
  }):Promise<boolean>{return canAccessObject({userId,objectFile,requestedPermission});}
  async downloadObject(file:LocalFile,cacheTtlSec=3600):Promise<Response>{
    const [metadata]=await file.getMetadata(),policy=await getObjectAclPolicy(file);
    return new Response(Readable.toWeb(file.createReadStream()) as ReadableStream,{headers:{
      "Content-Type":metadata.contentType,"Content-Length":metadata.size,
      "Cache-Control":policy?.visibility==="public"?`public, max-age=${cacheTtlSec}`:"private, no-store",
      "X-Content-Type-Options":"nosniff",
    }});
  }
}
