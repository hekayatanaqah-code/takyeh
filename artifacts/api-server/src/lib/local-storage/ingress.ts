import {Router,type IRouter} from "express";
import {LocalFile,ObjectNotFoundError} from "./files";
import {verifyTicket} from "./service";
export const localStorageIngress:IRouter=Router();
const allowed=new Set(["image/jpeg","image/png","image/webp","application/pdf","application/zip","video/mp4","video/quicktime","video/webm"]);
const attempts=new Map<string,{until:number;count:number}>();
localStorageIngress.use("/uploads",(req,res,next)=>{
  if(req.method!=="POST"){next();return;}
  const now=Date.now(),key=req.ip??"unknown";
  for(const [ip,value]of attempts)if(value.until<now)attempts.delete(ip);
  const value=attempts.get(key)??{until:now+300000,count:0};
  if(value.count>=128||attempts.size>=10000){res.status(429).json({error:"يرجى الانتظار قبل رفع المزيد من الملفات"});return;}
  value.count++;attempts.set(key,value);next();
});
localStorageIngress.put("/local-upload",async(req,res)=>{
  try{
    const ticket=verifyTicket(typeof req.query.ticket==="string"?req.query.ticket:"");
    const mime=(req.headers["content-type"]??"").split(";")[0].trim().toLowerCase();
    if(!allowed.has(mime)){res.status(415).json({error:"نوع الملف غير مدعوم"});return;}
    if(req.headers["content-length"] && (!/^\d+$/.test(req.headers["content-length"])||Number(req.headers["content-length"])>ticket.max)){
      res.status(413).json({error:"حجم الملف أكبر من الحد المسموح"});return;
    }
    await new LocalFile(ticket.name).saveStream(req,mime,ticket.max,ticket.aclPolicy);res.sendStatus(204);
  }catch(error){
    const status=error instanceof ObjectNotFoundError?403:([400,409,413].includes((error as {status:number}).status)?(error as {status:number}).status:500);
    res.status(status).json({error:status===403?"رابط الرفع غير صالح أو منتهي":"تعذر حفظ الملف"});
  }
});
