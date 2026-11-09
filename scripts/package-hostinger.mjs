import {readdir,readFile,writeFile,mkdir,cp,rm} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
import {createRequire,builtinModules} from "node:module";
import {execFileSync} from "node:child_process";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const output=path.join(root,"generated-artifacts/hostinger"),release=path.join(output,"takyeh-hostinger");
const command=(args,env={})=>execFileSync("pnpm",args,{cwd:root,env:{...process.env,...env},stdio:"inherit"});
const refresh=process.argv.includes("--refresh-runtime");
await mkdir(output,{recursive:true,mode:0o700});
const audit=JSON.parse(await readFile(path.join(root,".local/hostinger-reports/runtime-audit.json"),"utf8"));
if(!audit.staticAuditPassed||!audit.nativeRuntimeBindingsVerified)throw new Error("Native source gate is not clear.");
if(!refresh)await rm(release,{recursive:true,force:true});
await mkdir(release,{recursive:true,mode:0o700});
for(const name of ["app","database","private-storage","reports"])await mkdir(path.join(release,name),{recursive:true,mode:0o700});
let seedCounts;
if(refresh){
  seedCounts=JSON.parse(await readFile(path.join(release,"manifest.json"),"utf8")).seedCounts;
  await rm(path.join(release,"reports/package-smoke.json"),{force:true});
}
if(!refresh){
const exports=path.join(root,".local/mariadb-exports");
const dirs=(await readdir(exports,{withFileTypes:true})).filter(item=>item.isDirectory()&&/^\d{4}-/.test(item.name)).map(item=>item.name).sort();
const source=path.join(exports,dirs.at(-1)??"missing");
const original=JSON.parse(await readFile(path.join(source,"manifest.json"),"utf8"));
seedCounts=original.seedCounts;
for(const name of ["schema.sql","seed.sql"]){
  const content=await readFile(path.join(source,name));
  if(createHash("sha256").update(content).digest("hex")!==original.sha256[name])throw new Error("Database export integrity failed.");
  await writeFile(path.join(release,"database",name),content,{mode:0o600});
}
await cp(path.join(root,"lib/db/src/mariadb/001-application-contract.sql"),path.join(release,"database/001-application-contract.sql"));
await cp(path.join(root,".local/mariadb-runtime/002-transaction-mutex.sql"),path.join(release,"database/002-transaction-mutex.sql"));
command(["--filter","@workspace/api-server","exec","tsx","src/maintenance/export-hostinger-media.ts",path.join(source,"media-references.json"),path.join(release,"private-storage")],{NODE_ENV:"test"});
command(["--filter","@workspace/chalet-marketplace","run","build"],{PORT:"5173",BASE_PATH:"/"});
await cp(path.join(root,"artifacts/chalet-marketplace/dist/public"),path.join(release,"app/public"),{recursive:true});
}
await rm(path.join(release,"app/server"),{recursive:true,force:true});
await cp(path.join(root,".local/hostinger-stage/server"),path.join(release,"app/server"),{recursive:true,filter:file=>!file.endsWith(".map")&&!file.endsWith("build-meta.json")});
await cp(path.join(root,"artifacts/api-server/hostinger-start.mjs"),path.join(release,"app/launcher.mjs"));
await cp(path.join(root,"artifacts/api-server/hostinger-entry.cjs"),path.join(release,"app/server.cjs"));
await writeFile(path.join(release,"app/server.js"),'import "./server.cjs";\n');
await cp(path.join(root,"artifacts/api-server/setup-db.js"),path.join(release,"app/setup-db.js"));
await cp(path.join(root,"artifacts/api-server/hostinger-deploy-check.mjs"),path.join(release,"app/deploy-check.mjs"));
await mkdir(path.join(release,"app/database"),{recursive:true});
for(const filename of ["schema.sql","001-application-contract.sql","002-transaction-mutex.sql"]){
  await cp(path.join(release,"database",filename),path.join(release,"app/database",filename));
}
const api=JSON.parse(await readFile(path.join(root,"artifacts/api-server/package.json"),"utf8"));
const req=createRequire(path.join(root,"artifacts/api-server/package.json"));
const dependencies={};
for(const name of ["mysql2","sharp","nodemailer","ffmpeg-static"]){
  let location=path.dirname(req.resolve(name));
  for(;;){
    try{const p=JSON.parse(await readFile(path.join(location,"package.json"),"utf8"));if(p.name===name){dependencies[name]=p.version;break;}}catch{}
    const parent=path.dirname(location);if(parent===location)throw new Error(`Cannot resolve ${name}`);location=parent;
  }
}
dependencies["supports-color"]="8.1.1";
const meta=JSON.parse(await readFile(path.join(root,".local/hostinger-stage/server/build-meta.json"),"utf8"));
const builtins=new Set(builtinModules.flatMap(value=>[value,`node:${value}`]));
for(const file of Object.values(meta.outputs))for(const item of file.imports){
  if(!item.external||builtins.has(item.path))continue;
  const name=item.path.startsWith("@")?item.path.split("/").slice(0,2).join("/"):item.path.split("/")[0];
  if(!dependencies[name])throw new Error(`Unpackaged external dependency: ${name}`);
}
await writeFile(path.join(release,"app/package.json"),JSON.stringify({
  name:"takyeh-hostinger",version:"1.0.0",private:true,type:"module",main:"server.cjs",
  engines:{node:">=22.9 <25"},scripts:{
    "setup-db":"node setup-db.js",
    build:"node deploy-check.mjs",
    start:"node server.cjs",
  },
  dependencies,pnpm:{onlyBuiltDependencies:["ffmpeg-static","sharp"]},
},null,2));
await writeFile(path.join(release,"app/.env.example"),[
  "NODE_ENV=production","# PORT is supplied dynamically by Hostinger; do not hardcode it.",
  "MARIADB_DATABASE_URL=mysql://DB_USER:DB_PASSWORD@localhost:3306/DB_NAME",
  "SESSION_SECRET=","DISABLE_STARTUP_SEEDING=true","TAKYEH_AUTO_SETUP_DB=true","FRONTEND_DIST_DIR=./public",
  "APP_STORAGE_DIR=/absolute/private/path/takyeh-storage","PUBLIC_SITE_URL=https://takyeh.sa",
  "PUBLIC_URL=https://takyeh.sa","PASSWORD_RESET_PUBLIC_URL=https://takyeh.sa","TZ=UTC",
  "# Optional integrations: configure existing payment/email credentials securely; never commit them.",
  "MOYASAR_SECRET_KEY=","SMTP_HOST=","SMTP_PORT=587","SMTP_USER=","SMTP_PASS=","SMTP_FROM=","",
].join("\n"));
await cp(path.join(root,".local/hostinger-reports/review.html"),path.join(release,"reports/source-review.html"));
await cp(path.join(root,"docs/hostinger-install-ar.md"),path.join(release,"اقرأني.md"));
const files=[];
async function walk(directory){
  for(const item of await readdir(directory,{withFileTypes:true})){
    const filename=path.join(directory,item.name);
    if(item.name==="node_modules"||filename===path.join(release,"manifest.json"))continue;
    if(item.isSymbolicLink())throw new Error("Release contains a symlink.");
    if(item.isDirectory())await walk(filename);
    else{const data=await readFile(filename);files.push({path:path.relative(release,filename),size:data.length,sha256:createHash("sha256").update(data).digest("hex")});}
  }
}
await walk(release);
await writeFile(path.join(release,"manifest.json"),JSON.stringify({createdAt:new Date().toISOString(),database:"MariaDB 10.11",
  seedScope:"settings and current principal admin only",seedCounts,sourceBlockers:0,
  storage:"private persistent local filesystem",hostingerLiveVerified:false,files},null,2),{mode:0o600});
console.log(JSON.stringify({releaseDirectory:path.relative(root,release),files:files.length,
  warning:"Installation and live domain activation are separate; no deployment performed."}));
