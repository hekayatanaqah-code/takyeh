/** Read-only source export: only objects referenced by authorized site settings. */
import {readFile,writeFile,mkdir} from "node:fs/promises";
import path from "node:path";
import {ObjectStorageService} from "../lib/objectStorage";
import {getObjectAclPolicy} from "../lib/objectAcl";
import {LocalFile,initializeLocalStorage} from "../lib/local-storage/files";
import {createHash} from "node:crypto";
const [referencesPath,destination]=process.argv.slice(2);
if(!referencesPath||!destination)throw new Error("References and private destination are required.");
process.env.APP_STORAGE_DIR=path.resolve(destination);
await initializeLocalStorage();
const references:unknown=JSON.parse(await readFile(referencesPath,"utf8"));
if(!Array.isArray(references)||references.some(value=>typeof value!=="string"))throw new Error("Invalid media references.");
const source=new ObjectStorageService(),files:{reference:string;sha256:string;size:number}[]=[];
for(const raw of references as string[]){
  let entity=raw.startsWith("https://storage.googleapis.com/")?source.normalizeObjectEntityPath(raw):raw.replace(/^\/api\/storage/,"");
  entity=decodeURIComponent(entity);
  const publicPrefix="/public-objects/";
  const file=entity.startsWith(publicPrefix)
    ?await source.searchPublicObject(entity.slice(publicPrefix.length))
    :await source.getObjectEntityFile(entity);
  if(!file)throw new Error("A referenced site asset is missing.");
  const acl=await getObjectAclPolicy(file);
  if(acl?.visibility==="private")throw new Error("A site setting references a private object; review it before export.");
  if(!acl&& !entity.startsWith("/objects/uploads/")&&!entity.startsWith(publicPrefix))
    throw new Error("Site asset visibility must be reviewed.");
  const [metadata]=await file.getMetadata();
  const pinned=file.bucket.file(file.name,{generation:metadata.generation});
  const logical=entity.startsWith(publicPrefix)?`public/${entity.slice(publicPrefix.length)}`:`private/${entity.replace(/^\/objects\//,"")}`;
  const output=new LocalFile(logical);
  const size=Number(metadata.size);
  if(!Number.isSafeInteger(size)||size<1)throw new Error("Invalid source asset size.");
  await output.saveStream(pinned.createReadStream(),metadata.contentType??"application/octet-stream",size);
  await output.setMetadata({metadata:{"custom:aclPolicy":JSON.stringify({owner:"platform",visibility:"public"})}});
  const [saved]=await output.getMetadata();
  files.push({reference:raw,sha256:saved.generation,size:Number(saved.size)});
}
await mkdir(path.resolve(destination),{recursive:true,mode:0o700});
await writeFile(path.join(destination,"site-assets-manifest.json"),JSON.stringify({scope:"site-settings-only",files},null,2),{mode:0o600});
console.log(JSON.stringify({exportedSiteAssets:files.length,privateBusinessFilesExported:0}));
