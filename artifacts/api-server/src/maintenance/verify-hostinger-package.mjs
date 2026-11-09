import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import {readFile,writeFile,mkdtemp,cp,rm} from "node:fs/promises";
import {createRequire} from "node:module";
import {spawn,execFileSync} from "node:child_process";
import {once} from "node:events";
import {createServer} from "node:net";
import {randomBytes} from "node:crypto";
import path from "node:path";
import {tmpdir} from "node:os";
const release=path.resolve(process.argv[2]??"");
if(!release.endsWith("takyeh-hostinger")||!process.env.MARIADB_VERIFY_SOCKET)throw new Error("Isolated package and verification socket required.");
const database=`takyeh_release_test_${randomBytes(6).toString("hex")}`;
const storage=await mkdtemp(path.join(tmpdir(),"takyeh-release-storage-"));
const control=await mysql.createConnection({socketPath:process.env.MARIADB_VERIFY_SOCKET,user:"root",charset:"utf8mb4",multipleStatements:true});
const app=path.join(release,"app"),req=createRequire(path.join(app,"package.json"));
const ffmpeg=req("ffmpeg-static");
const binaryVersion=execFileSync(ffmpeg,["-version"],{encoding:"utf8"}).split("\n")[0];
const reserver=createServer();reserver.listen(0,"127.0.0.1");await once(reserver,"listening");
const port=reserver.address().port;await new Promise(resolve=>reserver.close(resolve));
let child,childEnv;const log=[];const checks=[];
const fixturePassword=`temporary-fixture-${randomBytes(12).toString("hex")}`;
const base=`http://127.0.0.1:${port}`;
async function stop(){
  if(!child||child.exitCode!==null)return;
  child.kill("SIGTERM");
  await Promise.race([once(child,"exit"),new Promise(resolve=>setTimeout(()=>{child.kill("SIGKILL");resolve();},3000))]);
}
async function start(){
  const url=new URL(`mysql://root@localhost/${database}`);
  url.searchParams.set("socketPath",process.env.MARIADB_VERIFY_SOCKET);
  childEnv={
    PATH:process.env.PATH,HOME:process.env.HOME,PORT:String(port),TZ:"UTC",
    MARIADB_DATABASE_URL:url.toString(),SESSION_SECRET:randomBytes(48).toString("hex"),
    DISABLE_STARTUP_SEEDING:"true",APP_STORAGE_DIR:storage,
    PUBLIC_SITE_URL:`https://127.0.0.1:${port}`,PUBLIC_URL:`https://127.0.0.1:${port}`,
  };
  child=spawn(process.execPath,[path.join(app,"server.js")],{cwd:storage,env:childEnv,stdio:["ignore","pipe","pipe"]});
  for(const stream of [child.stdout,child.stderr])stream.on("data",bytes=>{log.push(bytes.toString());if(log.length>100)log.shift();});
  for(let attempt=0;attempt<60;attempt++){
    if(child.exitCode!==null)throw new Error(`Standalone process exited: ${log.join("").slice(-4500)}`);
    try{if((await fetch(base+"/api/healthz")).ok)return;}catch{}
    await new Promise(resolve=>setTimeout(resolve,150));
  }
  throw new Error(`Standalone startup timed out: ${log.join("").slice(-4500)}`);
}
const assert=(value,message)=>{if(!value)throw new Error(message);};
try{
  await control.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`);
  await control.query(`USE \`${database}\``);
  const setupUrl=new URL(`mysql://root@localhost/${database}`);
  setupUrl.searchParams.set("socketPath",process.env.MARIADB_VERIFY_SOCKET);
  const setupEnv={PATH:process.env.PATH,HOME:process.env.HOME,MARIADB_DATABASE_URL:setupUrl.toString()};
  execFileSync(process.execPath,[path.join(app,"setup-db.js")],{cwd:storage,env:setupEnv,stdio:"pipe"});
  const [[mutex]]=await control.query("SELECT COUNT(*) AS total FROM application_transaction_mutex WHERE id BETWEEN 0 AND 10");
  assert(mutex.total===11,"Required mutex rows were not created.");
  await control.query(await readFile(path.join(release,"database/seed.sql"),"utf8"));
  const [[adminBefore]]=await control.query("SELECT password_hash FROM admin_staff WHERE username='admin'");
  execFileSync(process.execPath,[path.join(app,"setup-db.js")],{cwd:storage,env:setupEnv,stdio:"pipe"});
  execFileSync("npm",["run","build"],{cwd:app,env:setupEnv,stdio:"pipe"});
  const [[adminAfter]]=await control.query("SELECT password_hash FROM admin_staff WHERE username='admin'");
  assert(adminBefore.password_hash===adminAfter.password_hash,"Repeated setup changed administrator data.");
  const [[allMutex]]=await control.query("SELECT COUNT(*) AS total FROM application_transaction_mutex WHERE id BETWEEN 0 AND 4095");
  assert(allMutex.total===4096,"Full transaction lock range was not preserved.");
  checks.push("automatic-schema-setup-repeatable-build-mutex-0-to-10-and-existing-data-preserved");
  await control.query("SET SESSION sql_mode='STRICT_ALL_TABLES,ANSI_QUOTES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'");
  const [counts]=await control.query("SELECT (SELECT COUNT(*) FROM admin_staff) AS admins,(SELECT COUNT(*) FROM owner_bookings) AS bookings,(SELECT COUNT(*) FROM service_appointments) AS services,(SELECT COUNT(*) FROM quick_sales) AS sales");
  assert(counts[0].admins===1&&counts[0].bookings===0&&counts[0].services===0&&counts[0].sales===0,"Seed scope is incorrect.");
  // This changes ONLY the throwaway DB. Never read or send the real password.
  await control.execute("UPDATE admin_staff SET password_hash=? WHERE username='admin'",[await bcrypt.hash(fixturePassword,10)]);
  await cp(path.join(release,"private-storage"),storage,{recursive:true});
  await start();checks.push("production-launcher-from-foreign-cwd-dynamic-port-native-schema-and-health");
  const conflict=spawn(process.execPath,[path.join(app,"server.js")],{cwd:storage,env:childEnv,stdio:["ignore","pipe","pipe"]});
  let conflictLog="";
  for(const stream of [conflict.stdout,conflict.stderr])stream.on("data",data=>{conflictLog+=data.toString();});
  let conflictTimer;
  try {
    const [code]=await Promise.race([once(conflict,"exit"),new Promise((_,reject)=>{
      conflictTimer=setTimeout(()=>reject(new Error("Port-conflict process did not terminate.")),10000);
    })]);
    assert(code===1&&conflictLog.includes("EADDRINUSE"),"Port conflict was not handled cleanly.");
    assert((await fetch(base+"/api/healthz")).status===200,"Port-conflict process disturbed the original server.");
    checks.push("port-conflict-clean-exit-with-original-server-healthy");
  } finally {
    clearTimeout(conflictTimer);
    if(conflict.exitCode===null)conflict.kill("SIGKILL");
  }
  assert((await fetch(base)).status===200,"Built frontend unavailable.");
  assert((await fetch(base+"/readyz")).status===200,"Native listener reported API before readiness.");
  assert((await(await fetch(base+"/healthz")).json()).applicationReady===true,"Native backend not attached.");
  checks.push("native-http-listener-single-port-frontend-and-backend-readiness");
  assert((await fetch(base+"/api/page-content")).status===200,"Native settings API failed.");
  assert((await fetch(base+"/api/not-a-real-route")).status===404,"Unknown API returned SPA.");
  assert((await fetch(base+"/.env")).status===404,"Private environment path is exposed.");
  checks.push("frontend-settings-and-private-paths");
  const login=await fetch(base+"/api/admin-portal-login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:"admin",password:fixturePassword})});
  assert(login.status===200,`Native admin login failed: ${login.status}`);
  const cookie=login.headers.getSetCookie().map(value=>value.split(";")[0]).join("; ");
  assert(cookie.includes("admin_staff_sid="),"Admin session cookie missing.");
  const who=await fetch(base+"/api/admin-staff/me",{headers:{Cookie:cookie}});
  const identity=await who.json();
  assert(who.status===200&&identity.adminStaff?.username==="admin"&&identity.adminStaff?.isSuperAdmin===true,"Native session or boolean decoding failed.");
  const dashboard=await fetch(base+"/api/admin/dashboard",{headers:{Cookie:cookie}});
  assert(dashboard.status===200,`Native admin financial overview failed: ${dashboard.status}`);
  checks.push("admin-login-session-and-financial-overview");
  const upload=await fetch(base+"/api/storage/uploads/request-url",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:"fixture.pdf",size:19,contentType:"application/pdf"})});
  assert(upload.status===200,"Signed upload request failed.");
  const ticket=await upload.json(),target=new URL(ticket.uploadURL);
  const bytes=Buffer.from("%PDF-1.7\nfixture\n%%EOF");
  const put=await fetch(base+target.pathname+target.search,{method:"PUT",headers:{"Content-Type":"application/pdf"},body:bytes});
  assert(put.status===204,`Standalone upload failed: ${put.status}`);
  const objectUrl=base+"/api/storage"+ticket.objectPath;
  assert(Buffer.from(await(await fetch(objectUrl)).arrayBuffer()).equals(bytes),"Standalone bytes changed.");
  const logical=path.join(storage,"private",...ticket.objectPath.slice("/objects/".length).split("/"));
  const metaPath=path.join(logical,".meta.json"),metadata=JSON.parse(await readFile(metaPath,"utf8"));
  metadata.metadata["custom:aclPolicy"]=JSON.stringify({owner:"fixture-private",visibility:"private"});
  await writeFile(metaPath,JSON.stringify(metadata));
  assert((await fetch(objectUrl)).status===403,"Raw private object was exposed.");
  checks.push("signed-upload-and-private-acl");
  const png=await req("sharp")({create:{width:2,height:2,channels:3,background:"#ffffff"}}).png().toBuffer();
  const form=new FormData();form.append("file",new Blob([png],{type:"image/png"}),"fixture.png");
  const processed=await fetch(base+"/api/storage/uploads/process",{method:"POST",body:form});
  assert(processed.status===200,"Native image processing failed.");
  const image=(await processed.json()).url;
  const media=await fetch(base+image);assert(media.status===200&&media.headers.get("Content-Type")==="image/webp","Processed image missing.");
  await stop();await start();
  assert((await fetch(base+image)).status===200,"Uploads did not survive process restart.");
  checks.push("sharp-image-processing-and-restart-persistence");
  const assets=JSON.parse(await readFile(path.join(storage,"site-assets-manifest.json"),"utf8"));
  for(const asset of assets.files)assert((await fetch(base+asset.reference)).status===200,"A migrated site asset failed.");
  checks.push("migrated-site-assets");
  await stop();
  child=spawn(process.execPath,[path.join(app,"server.js")],{cwd:storage,
    env:{...childEnv,MARIADB_DATABASE_URL:"mysql://unavailable:unavailable@127.0.0.1:1/unavailable"},
    stdio:["ignore","pipe","pipe"]});
  for(const stream of [child.stdout,child.stderr])stream.on("data",bytes=>{log.push(bytes.toString());if(log.length>100)log.shift();});
  let failed=false;
  for(let attempt=0;attempt<60;attempt++){
    if(child.exitCode!==null)throw new Error("Native listener exited when database failed.");
    try{if((await(await fetch(base+"/healthz")).json()).status==="failed"){failed=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,150));
  }
  assert(failed,"Unavailable database did not produce a clear failed readiness state.");
  assert((await fetch(base)).status===200,"Database failure also broke static frontend.");
  assert((await fetch(base+"/readyz")).status===503,"Database failure was falsely reported ready.");
  assert((await fetch(base+"/api/page-content")).status===503,"Unavailable API was served as SPA/empty data.");
  checks.push("actual-database-failure-keeps-frontend-with-honest-api-unavailable-state");
  const result={passed:true,checkedAt:new Date().toISOString(),engine:"MariaDB 10.11",mode:"isolated production-bundle HTTP verification",
    databasePrivilegesVerified:false,liveHostingerVerified:false,externalPaymentsOrEmailSent:false,
    checks,binaryVersion,siteAssets:assets.files.length,
    note:"Temporary socket-only server and throwaway DB; no source or production data changed."};
  await writeFile(path.join(release,"reports/package-smoke.json"),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
}finally{
  await stop();await control.query(`DROP DATABASE IF EXISTS \`${database}\``);await control.end();await rm(storage,{recursive:true,force:true});
}
