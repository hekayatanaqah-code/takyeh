import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, cp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
const execute=promisify(execFile);

test("Hostinger server.js is independent of cwd, loads local .env and preserves hosting variables",async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),"hostinger-start-"));
  const root=path.join(directory,"app تكية");
  try {
    await mkdir(path.join(root,"server"),{recursive:true});
    await cp(new URL("../../hostinger-start.mjs",import.meta.url),path.join(root,"server.js"));
    await writeFile(path.join(root,"package.json"),'{"type":"module"}');
    await writeFile(path.join(root,"server/hostinger.mjs"),'process.stdout.write(JSON.stringify({cwd:process.cwd(),port:process.env.PORT,frontend:process.env.FRONTEND_DIST_DIR,mode:process.env.NODE_ENV}));');
    await writeFile(path.join(root,".env"),"PORT=3000\n");
    const result=await execute(process.execPath,[path.join(root,"server.js")],{cwd:directory,env:{PATH:process.env.PATH,PORT:"49155"}});
    assert.deepEqual(JSON.parse(result.stdout),{cwd:root,port:"49155",frontend:path.join(root,"public")+path.sep,mode:"production"});
    const fromEnv=await execute(process.execPath,[path.join(root,"server.js")],{cwd:directory,env:{PATH:process.env.PATH}});
    assert.equal(JSON.parse(fromEnv.stdout).port,"3000");
    await rm(path.join(root,".env"));
    const noFile=await execute(process.execPath,[path.join(root,"server.js")],{cwd:directory,env:{PATH:process.env.PATH,PORT:"6001"}});
    assert.equal(JSON.parse(noFile.stdout).port,"6001");
  } finally { await rm(directory,{recursive:true,force:true}); }
});
