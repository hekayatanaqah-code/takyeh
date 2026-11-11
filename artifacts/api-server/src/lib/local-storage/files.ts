import { constants,createReadStream,lstatSync,realpathSync,openSync,readFileSync } from "node:fs";
import { mkdir,lstat,readFile,writeFile,rename,rm,mkdtemp,statfs } from "node:fs/promises";
import path from "node:path";
import { createHash,randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import type { StorageMetadata } from "../storage-contract";
import type { ObjectAclPolicy } from "../objectAcl";

export class ObjectNotFoundError extends Error {
  constructor(){super("Object not found");this.name="ObjectNotFoundError";}
}
export interface Manifest extends StorageMetadata {
  contentType:string;size:string;generation:string;
  metadata:Record<string,string|number|boolean|null>;
}
export function storageRoot():string {
  const value=process.env.APP_STORAGE_DIR;
  if(!value || !path.isAbsolute(value) || path.resolve(value)===path.parse(value).root)
    throw new Error("APP_STORAGE_DIR must be an absolute private persistent directory.");
  const root=path.resolve(value);
  if(root.split(path.sep).some(part=>["public_html","htdocs","www","public"].includes(part)))
    throw new Error("APP_STORAGE_DIR must be outside web-served directories.");
  return root;
}
export function maximumUploadBytes():number {
  const value=Number(process.env.MAX_UPLOAD_BYTES ?? 268435456);
  if(!Number.isSafeInteger(value)||value<1024||value>1073741824)throw new Error("Invalid MAX_UPLOAD_BYTES.");
  return value;
}
export async function initializeLocalStorage():Promise<void>{
  const root=storageRoot();
  const frontend=process.env.FRONTEND_DIST_DIR && path.resolve(process.env.FRONTEND_DIST_DIR);
  if(frontend && (root===frontend || root.startsWith(frontend+path.sep)))
    throw new Error("Private storage overlaps the frontend.");
  if(process.env.NODE_ENV==="production" && (root===process.cwd()||root.startsWith(process.cwd()+path.sep)))
    throw new Error("Persistent storage must be outside the release directory.");
  await mkdir(root,{recursive:true,mode:0o700});
  if(realpathSync(root)!==root || (await lstat(root)).isSymbolicLink())
    throw new Error("Storage symlinks are not allowed; configure its canonical path.");
}
function segments(name:string):string[]{
  const parts=name.split("/");
  if(parts.length<2 || !["private","public"].includes(parts[0]) ||
    parts.some(part=>! /^[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/.test(part)||part==="."||part===".."))
    throw new ObjectNotFoundError();
  return parts;
}
function checked(name:string,allowMissing=false):string{
  const root=storageRoot(),parts=segments(name);
  if(realpathSync(root)!==root)throw new Error("Unsafe storage root.");
  let current=root;
  for(const part of parts){
    current=path.join(current,part);
    try {const st=lstatSync(current);if(st.isSymbolicLink()||!st.isDirectory())throw new Error("Unsafe object directory.");}
    catch(error){if(allowMissing&&(error as NodeJS.ErrnoException).code==="ENOENT")continue;throw error;}
  }
  return current;
}
async function metadataAt(directory:string):Promise<Manifest>{
  const filename=path.join(directory,".meta.json");
  if((await lstat(filename)).isSymbolicLink())throw new Error("Unsafe object metadata.");
  const value=JSON.parse(await readFile(filename,"utf8")) as Manifest;
  if(!/^[a-f0-9]{64}$/.test(value.generation)||! /^\d+$/.test(value.size))throw new Error("Invalid object metadata.");
  return value;
}
export class LocalFile {
  readonly bucket={name:"local",file:(name:string,options?:{generation?:string|number})=>new LocalFile(name,options?.generation)};
  constructor(readonly name:string,private readonly pinned?:string|number){segments(name);}
  async exists():Promise<[boolean]>{
    try{await this.getMetadata();return[true];}
    catch(error){if(error instanceof ObjectNotFoundError||(error as NodeJS.ErrnoException).code==="ENOENT")return[false];throw error;}
  }
  async getMetadata():Promise<[Manifest]>{
    try{
      const value=await metadataAt(checked(this.name));
      if(this.pinned!==undefined&&String(this.pinned)!==value.generation)throw new ObjectNotFoundError();
      return[value];
    }catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")throw new ObjectNotFoundError();throw error;}
  }
  createReadStream(options:{start?:number;end?:number}={}):Readable{
    const directory=checked(this.name);
    // Check immutable generation synchronously before opening the byte stream.
    const meta=lstatSync(path.join(directory,".meta.json"));
    if(meta.isSymbolicLink())throw new Error("Unsafe object metadata.");
    if(this.pinned!==undefined){
      const value=JSON.parse(requireMetadata(directory));
      if(String(this.pinned)!==value.generation)throw new ObjectNotFoundError();
    }
    const fd=openSync(path.join(directory,".bytes"),constants.O_RDONLY|constants.O_NOFOLLOW);
    return createReadStream(path.join(directory,".bytes"),{...options,fd,autoClose:true});
  }
  async saveStream(input:AsyncIterable<Uint8Array>,contentType:string,limit=maximumUploadBytes(),aclPolicy?:ObjectAclPolicy):Promise<void>{
    await initializeLocalStorage();
    segments(this.name);
    const parentName=this.name.split("/").slice(0,-1).join("/");
    let parent=storageRoot();
    for(const part of parentName.split("/")){
      parent=path.join(parent,part);await mkdir(parent,{mode:0o700}).catch(error=>{if(error.code!=="EEXIST")throw error;});
      if((await lstat(parent)).isSymbolicLink()||!(await lstat(parent)).isDirectory())throw new Error("Unsafe storage parent.");
    }
    const available=await statfs(parent);
    if(available.bavail*available.bsize<Math.min(limit,64*1024*1024)+64*1024*1024)throw new Error("Insufficient storage space.");
    const temporary=await mkdtemp(path.join(parent,".pending-"));
    const {open}=await import("node:fs/promises");
    const handle=await open(path.join(temporary,".bytes"),"wx",0o600);
    let size=0;const hash=createHash("sha256");
    try{
      for await(const chunk of input){
        size+=chunk.byteLength;if(size>limit)throw Object.assign(new Error("Upload too large."),{status:413});
        hash.update(chunk);await handle.writeFile(chunk);
      }
      await handle.sync();await handle.close();
      if(size===0)throw Object.assign(new Error("Empty upload."),{status:400});
      const generation=hash.digest("hex");
      const manifest:Manifest={size:String(size),generation,contentType,
        metadata:{"custom:aclPolicy":JSON.stringify(aclPolicy??{owner:"platform",visibility:this.name.startsWith("public/")||this.name.startsWith("private/uploads/")?"public":"private"})}};
      await writeFile(path.join(temporary,".meta.json"),JSON.stringify(manifest),{mode:0o600});
      const destination=checked(this.name,true);
      try{await rename(temporary,destination);}
      catch(error){
        if(!["EEXIST","ENOTEMPTY"].includes((error as NodeJS.ErrnoException).code??""))throw error;
        const [existing]=await this.getMetadata();
        if(existing.generation!==generation||existing.contentType!==contentType||existing.size!==String(size))
          throw Object.assign(new Error("Immutable object already exists."),{status:409});
        if(aclPolicy&&existing.metadata["custom:aclPolicy"]!==JSON.stringify(aclPolicy))
          throw Object.assign(new Error("Immutable object policy differs."),{status:409});
      }
    }finally{await handle.close().catch(()=>{});await rm(temporary,{recursive:true,force:true});}
  }
  async save(bytes:Buffer,options:{contentType:string;resumable?:boolean}):Promise<void>{
    await this.saveStream((async function*(){yield bytes;})(),options.contentType);
  }
  async setMetadata(value:{metadata:Record<string,string>}):Promise<void>{
    const [current]=await this.getMetadata(),directory=checked(this.name);
    const temporary=path.join(directory,`.meta-${randomUUID()}`);
    try{
      await writeFile(temporary,JSON.stringify({...current,metadata:{...current.metadata,...value.metadata}}),{mode:0o600,flag:"wx"});
      await rename(temporary,path.join(directory,".meta.json"));
    }finally{await rm(temporary,{force:true});}
  }
  async copy(destination:LocalFile):Promise<void>{
    const [metadata]=await this.getMetadata();
    await destination.saveStream(this.createReadStream(),metadata.contentType,Number(metadata.size));
  }
  async delete(options:{ignoreNotFound?:boolean}={}):Promise<void>{
    try{await this.getMetadata();await rm(checked(this.name),{recursive:true});}
    catch(error){if(options.ignoreNotFound&&error instanceof ObjectNotFoundError)return;throw error;}
  }
}
function requireMetadata(directory:string):string{return readFileSync(path.join(directory,".meta.json"),"utf8");}
