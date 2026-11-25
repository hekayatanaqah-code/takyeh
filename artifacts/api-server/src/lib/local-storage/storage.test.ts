import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm,symlink,mkdir} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import express from "express";
import {once} from "node:events";
import {ObjectStorageService,initializeLocalStorage,verifyTicket} from "./service";
import {LocalFile} from "./files";
import {localStorageIngress} from "./ingress";
import {ObjectPermission} from "../objectAcl";
import {createHmac} from "node:crypto";
import {Readable} from "node:stream";

test("standalone storage: signed streamed uploads, immutable copies, ACL, traversal, expiry and persistent metadata",async()=>{
  const root=await mkdtemp(path.join(tmpdir(),"takyeh-storage-"));
  const env={APP_STORAGE_DIR:process.env.APP_STORAGE_DIR,PUBLIC_SITE_URL:process.env.PUBLIC_SITE_URL,
    SESSION_SECRET:process.env.SESSION_SECRET,MAX_UPLOAD_BYTES:process.env.MAX_UPLOAD_BYTES};
  process.env.APP_STORAGE_DIR=root;
  process.env.SESSION_SECRET="local-integration-fixture-only-".repeat(3);
  process.env.MAX_UPLOAD_BYTES="4096";
  const app=express();app.use("/api/storage",localStorageIngress);
  // Deliberately mount JSON parsing afterwards, as the real application does.
  app.use(express.json());
  const server=app.listen(0,"127.0.0.1");await once(server,"listening");
  const address=server.address();assert.ok(address&&typeof address!=="string");
  process.env.PUBLIC_SITE_URL=`http://127.0.0.1:${address.port}`;
  const service=new ObjectStorageService();
  try{
    await initializeLocalStorage();
    const url=await service.getObjectEntityUploadURL();
    const objectPath=service.normalizeObjectEntityPath(url);
    assert.match(objectPath,/^\/objects\/uploads\/[a-f0-9-]{36}$/);
    const bytes=Buffer.from("%PDF-1.7\nمرفق عربي\n%%EOF");
    assert.equal((await fetch(url,{method:"PUT",headers:{"Content-Type":"application/pdf"},body:bytes})).status,204);
    const file=await service.getObjectEntityFile(objectPath);
    const [metadata]=await file.getMetadata();
    assert.equal(Number(metadata.size),bytes.length);
    assert.equal(metadata.contentType,"application/pdf");
    assert.equal(Buffer.from(await(await service.downloadObject(file)).arrayBuffer()).equals(bytes),true);
    assert.equal((await fetch(url,{method:"PUT",headers:{"Content-Type":"application/pdf"},body:bytes})).status,204);
    assert.equal((await fetch(url,{method:"PUT",headers:{"Content-Type":"application/pdf"},body:"different"})).status,409);
    const importPolicy={owner:"owner_migration_fixture",visibility:"private" as const};
    const payload=Buffer.from(JSON.stringify({name:"private/uploads/migrated-private-fixture",
      expiry:Date.now()+60000,max:4096,aclPolicy:importPolicy})).toString("base64url");
    const signature=createHmac("sha256",process.env.SESSION_SECRET!).update(`local-upload:${payload}`).digest("hex");
    const importUrl=`${process.env.PUBLIC_SITE_URL}/api/storage/local-upload?ticket=${payload}.${signature}`;
    assert.equal((await fetch(importUrl,{method:"PUT",headers:{"Content-Type":"application/pdf"},body:bytes})).status,204);
    const imported=await service.getObjectEntityFile("/objects/uploads/migrated-private-fixture");
    const [importedMeta]=await imported.getMetadata();
    assert.deepEqual(JSON.parse(String(importedMeta.metadata["custom:aclPolicy"])),importPolicy);
    assert.equal(await service.canAccessObjectEntity({objectFile:imported,userId:"owner_migration_fixture"}),true);
    assert.equal(await service.canAccessObjectEntity({objectFile:imported,userId:"unrelated_owner"}),false);
    const destination=file.bucket.file(file.name.replace("/uploads/","/deliveries/"));
    await file.bucket.file(file.name,{generation:metadata.generation}).copy(destination);
    const deliveryPath=objectPath.replace("/uploads/","/deliveries/");
    await service.trySetObjectEntityAclPolicy(deliveryPath,{owner:"owner-fixture",visibility:"private"});
    const reopened=await new ObjectStorageService().getObjectEntityFile(deliveryPath);
    assert.equal(await service.canAccessObjectEntity({objectFile:reopened,userId:"other",requestedPermission:ObjectPermission.READ}),false);
    assert.equal(await service.canAccessObjectEntity({objectFile:reopened,userId:"owner-fixture"}),true);
    assert.equal((await service.downloadObject(reopened)).headers.get("Cache-Control"),"private, no-store");
    assert.equal((await service.downloadObject(file)).headers.get("Cache-Control"),"public, max-age=3600");
    await assert.rejects(service.getObjectEntityFile("/objects/uploads/../../outside"));
    await assert.rejects(service.getObjectEntityFile("/objects/uploads/%2e%2e/secret"));
    const parsed=new URL(url);parsed.searchParams.set("ticket",parsed.searchParams.get("ticket")!.replace(/.$/,"x"));
    assert.equal((await fetch(parsed,{method:"PUT",headers:{"Content-Type":"application/pdf"},body:bytes})).status,403);
    const validTicket=new URL(url).searchParams.get("ticket")!;
    assert.equal(verifyTicket(validTicket).name,file.name);
    const tooLarge=await service.getObjectEntityUploadURL();
    assert.equal((await fetch(tooLarge,{method:"PUT",headers:{"Content-Type":"application/pdf"},body:Buffer.alloc(4097)})).status,413);
    assert.equal((await fetch(await service.getObjectEntityUploadURL(),{method:"PUT",headers:{"Content-Type":"text/html"},body:"<script/>"})).status,415);
    await mkdir(path.join(root,"private","unsafe"));
    await symlink(tmpdir(),path.join(root,"private","unsafe","escape"));
    await assert.rejects(new LocalFile("private/unsafe/escape/object").save(bytes,{contentType:"application/pdf"}),/Unsafe/);
    await destination.delete();await assert.rejects(service.getObjectEntityFile(deliveryPath));
    assert.equal((await file.exists())[0],true,"deleting a copy never deletes its source");
  }finally{
    await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    for(const [key,value]of Object.entries(env)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
    await rm(root,{recursive:true,force:true});
  }
});

test("video ingress streams 28, 94 and 200 MiB without JSON buffering or video truncation",async()=>{
  const root=await mkdtemp(path.join(tmpdir(),"takyeh-video-storage-"));
  const env={APP_STORAGE_DIR:process.env.APP_STORAGE_DIR,PUBLIC_SITE_URL:process.env.PUBLIC_SITE_URL,
    SESSION_SECRET:process.env.SESSION_SECRET,MAX_UPLOAD_BYTES:process.env.MAX_UPLOAD_BYTES};
  Object.assign(process.env,{APP_STORAGE_DIR:root,SESSION_SECRET:"video-stream-fixture-only-".repeat(3),
    MAX_UPLOAD_BYTES:String(200*1024*1024)});
  const app=express();app.use("/api/storage",localStorageIngress);app.use(express.json());
  const server=app.listen(0,"127.0.0.1");await once(server,"listening");
  const address=server.address();assert.ok(address&&typeof address!=="string");
  process.env.PUBLIC_SITE_URL=`http://127.0.0.1:${address.port}`;
  const service=new ObjectStorageService();
  try{
    await initializeLocalStorage();
    // Generate chunks lazily: the test and server never hold the whole video in RAM.
    const chunk=Buffer.alloc(1024*1024,0x76);
    for(const mib of [28,94,200]){
      const url=await service.getObjectEntityUploadURL();
      const response=await fetch(url,{method:"PUT",headers:{"Content-Type":"video/mp4","Content-Length":String(mib*chunk.length)},
        body:Readable.from((async function*(){for(let i=0;i<mib;i++)yield chunk;})()),
        duplex:"half"} as RequestInit);
      assert.equal(response.status,204,`${mib} MiB: ${await response.text()}`);
      const file=await service.getObjectEntityFile(service.normalizeObjectEntityPath(url));
      const [metadata]=await file.getMetadata();
      assert.equal(Number(metadata.size),mib*chunk.length);
      assert.equal(metadata.contentType,"video/mp4");
      let readBytes=0;for await(const bytes of file.createReadStream())readBytes+=bytes.length;
      assert.equal(readBytes,mib*chunk.length,"full content remains readable, without 30-second processing");
      await file.delete();
    }
    process.env.MAX_UPLOAD_BYTES=String(chunk.length);
    const response=await fetch(await service.getObjectEntityUploadURL(),{method:"PUT",
      headers:{"Content-Type":"video/mp4"},
      body:Readable.from((async function*(){yield chunk;yield chunk;})()),duplex:"half"} as RequestInit);
    assert.equal(response.status,413,"chunked uploads cannot bypass the ticket size limit");
    const failure=await response.json() as {code:string};
    assert.equal(failure.code,"UPLOAD_TOO_LARGE");
  }finally{
    await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    for(const [key,value]of Object.entries(env)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
    await rm(root,{recursive:true,force:true});
  }
});
