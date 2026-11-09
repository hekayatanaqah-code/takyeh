import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, cp, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";

async function freePort() {
  const socket=createServer();socket.listen(0,"127.0.0.1");await once(socket,"listening");
  const port=(socket.address() as {port:number}).port;
  await new Promise<void>(resolve=>socket.close(()=>resolve()));
  return port;
}
async function waitFor(check:()=>Promise<boolean>) {
  for(let i=0;i<100;i++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,40));}
  throw new Error("Fixture server timed out");
}
async function stop(child:ChildProcess) {
  if(child.exitCode!==null)return;
  const exited=once(child,"exit");child.kill("SIGTERM");
  const deadline=setTimeout(()=>child.kill("SIGKILL"),3000);
  try{await exited;}finally{clearTimeout(deadline);}
}
async function fixture(mode:"slow"|"failed",envPort=true){
  const directory=await mkdtemp(path.join(tmpdir(),"hostinger-start-"));
  const root=path.join(directory,"app تكية"),port=await freePort();
  await mkdir(path.join(root,"server"),{recursive:true});await mkdir(path.join(root,"public"));
  await cp(new URL("../../hostinger-start.mjs",import.meta.url),path.join(root,"server.js"));
  await writeFile(path.join(root,"package.json"),'{"type":"module"}');
  await writeFile(path.join(root,".env"),`PORT=${envPort?"3000":port}\n`);
  await writeFile(path.join(root,"public/index.html"),"<h1>واجهة الاختبار</h1>");
  await writeFile(path.join(root,"public/test.js"),"window.test=true;");
  await writeFile(path.join(directory,"private.txt"),"PRIVATE-FIXTURE");
  await symlink(path.join(directory,"private.txt"),path.join(root,"public/leak.txt"));
  await writeFile(path.join(root,"server/hostinger.mjs"),mode==="failed"
    ? 'export async function startHostinger(){throw new Error("fixture secure database failure")};export async function closeHostingerResources(){}'
    : `export async function startHostinger(server){
        await new Promise(resolve=>setTimeout(resolve,900));
        return {handler(req,res){res.setHeader("Content-Type","application/json");res.end(JSON.stringify({
          cwd:process.cwd(),port:process.env.PORT,frontend:process.env.FRONTEND_DIST_DIR,mode:process.env.NODE_ENV
        }));},shutdown(){return new Promise(resolve=>{server.close(resolve);server.closeIdleConnections();});}};
      } export async function closeHostingerResources(){}`);
  const child=spawn(process.execPath,[path.join(root,"server.js")],{
    cwd:directory,env:{PATH:process.env.PATH,...(envPort?{PORT:String(port)}:{})},stdio:["ignore","pipe","pipe"],
  });
  let log="";for(const stream of [child.stdout!,child.stderr!])stream.on("data",data=>{log+=data.toString();});
  const base=`http://127.0.0.1:${port}`;
  await waitFor(async()=>{try{return(await fetch(base+"/healthz")).ok;}catch{return false;}});
  return {directory,root,port,child,base,log:()=>log};
}

test("native listener serves SPA before slow backend, with safe paths and hosting env precedence",async()=>{
  const item=await fixture("slow");
  try {
    assert.equal(((await (await fetch(item.base+"/healthz")).json()) as {applicationReady:boolean}).applicationReady,false);
    assert.equal((await fetch(item.base+"/api/healthz")).status,503);
    assert.match(await(await fetch(item.base+"/owner/dashboard")).text(),/واجهة الاختبار/);
    assert.equal((await fetch(item.base+"/test.js")).headers.get("Content-Type"),"text/javascript; charset=utf-8");
    assert.equal((await fetch(item.base+"/test.js",{method:"HEAD"})).status,200);
    assert.equal((await fetch(item.base+"/test.js",{method:"HEAD"})).headers.get("Content-Length"),"17");
    assert.equal((await fetch(item.base+"/missing.js")).status,404);
    assert.equal((await fetch(item.base+"/",{method:"POST"})).status,405);
    for(const filename of ["/.env","/%2eenv","/database/schema.sql","/server/hostinger.mjs","/setup-db.js","/leak.txt","/%2e%2e%2fprivate.txt"]){
      const response=await fetch(item.base+filename);
      assert.equal(response.status,404,filename);assert.doesNotMatch(await response.text(),/PRIVATE-FIXTURE/);
    }
    await waitFor(async()=>(await fetch(item.base+"/readyz")).ok);
    assert.deepEqual(await(await fetch(item.base+"/api/fixture")).json(),{
      cwd:item.root,port:String(item.port),frontend:path.join(item.root,"public"),mode:"production",
    });
    assert.match(item.log(),/Native HTTP listener ready/);
  }finally{await stop(item.child);await rm(item.directory,{recursive:true,force:true});}
});

test("backend failure keeps frontend available, reports non-ready and loads .env from app root",async()=>{
  const item=await fixture("failed",false);
  try {
    await waitFor(async()=>((await(await fetch(item.base+"/healthz")).json()) as {status:string}).status==="failed");
    assert.equal((await fetch(item.base+"/")).status,200);
    assert.equal((await fetch(item.base+"/readyz")).status,503);
    const api=await fetch(item.base+"/api/healthz");
    assert.equal(api.status,503);assert.equal(((await api.json()) as {code:string}).code,"BACKEND_UNAVAILABLE");
    assert.doesNotMatch(item.log(),/fixture secure database failure/);
  }finally{await stop(item.child);await rm(item.directory,{recursive:true,force:true});}
});
