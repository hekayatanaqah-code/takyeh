import {Router,type IRouter} from "express";
import {LocalFile,ObjectNotFoundError} from "./files";
import {verifyTicket} from "./service";
import {logger} from "../logger";
import {StorageCapacityError} from "./capacity";
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
  const started=Date.now();
  const requestId=String(req.id??"");
  if(requestId)res.setHeader("X-Request-Id",requestId);
  try{
    const ticket=verifyTicket(typeof req.query.ticket==="string"?req.query.ticket:"");
    const mime=(req.headers["content-type"]??"").split(";")[0].trim().toLowerCase();
    if(!allowed.has(mime)){res.status(415).json({error:"نوع الملف غير مدعوم",code:"UPLOAD_UNSUPPORTED_TYPE",requestId});return;}
    if(req.headers["content-length"] && (!/^\d+$/.test(req.headers["content-length"])||Number(req.headers["content-length"])>ticket.max)){
      res.status(413).json({error:"حجم الملف أكبر من الحد المسموح",code:"UPLOAD_TOO_LARGE",requestId});return;
    }
    const expectedBytes=req.headers["content-length"]===undefined?undefined:Number(req.headers["content-length"]);
    await new LocalFile(ticket.name).saveStream(req,mime,ticket.max,ticket.aclPolicy,expectedBytes);res.sendStatus(204);
  }catch(error){
    const cause=error as NodeJS.ErrnoException & {status?:number};
    const status=error instanceof ObjectNotFoundError?403
      :cause.code==="ENOSPC"||cause.code==="EDQUOT"||cause.message==="Insufficient storage space."?507
      :[400,409,413].includes(cause.status??0)?cause.status!:500;
    const code=status===403?"UPLOAD_TICKET_INVALID":status===507?"UPLOAD_STORAGE_FULL"
      :status===413?"UPLOAD_TOO_LARGE":status===409?"UPLOAD_CONFLICT"
      :cause.code==="EACCES"||cause.code==="EROFS"?"UPLOAD_STORAGE_NOT_WRITABLE"
      :req.aborted?"UPLOAD_CONNECTION_ABORTED":"UPLOAD_STORAGE_FAILED";
    // Never log the ticket-bearing URL or file contents.
    (req.log??logger).error({code,status,requestId,systemCode:cause.code,errorName:cause.name,
      reason:cause.message?.replace(/https?:\/\/\S+/g,"[redacted]").slice(0,300),
      ...(error instanceof StorageCapacityError?{availableBytes:error.availableBytes,requiredBytes:error.requiredBytes}:{}),
      contentLength:req.headers["content-length"],elapsedMs:Date.now()-started},"Storage upload failed");
    if(!res.destroyed)res.status(status).json({error:status===403?"رابط الرفع غير صالح أو منتهي"
      :error instanceof StorageCapacityError?`مساحة ملفات الفيديو لا تكفي: المتاح ${Math.floor(error.availableBytes/1048576)} MiB، والمطلوب ${Math.ceil(error.requiredBytes/1048576)} MiB شاملاً هامش الأمان`
      :status===507?"مساحة التخزين المتاحة لا تكفي لحفظ الملف"
      :code==="UPLOAD_STORAGE_NOT_WRITABLE"?"خادم التخزين لا يسمح بكتابة الملفات":"تعذر حفظ الملف",code,requestId});
  }
});
