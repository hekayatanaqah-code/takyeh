import { useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { BASE } from "@/components/owner/owner-api";


export function ServiceContractPreviewDialog({ appointment, onClose }: { appointment: any | null; onClose: () => void }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  if (!appointment) return null;
  const contractUrl = `${BASE}/service-contract/${appointment.id}?embedded=1`;
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent dir="rtl" className="w-[96vw] max-w-4xl h-[92vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
          <DialogTitle>معاينة العقد الرقمي — {appointment.clientName}</DialogTitle>
          <DialogDescription>القالب الرسمي نفسه الذي يظهر للعميل في رابط العقد.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 bg-[#f7f3ee]">
          <iframe ref={frameRef} src={contractUrl} title={`عقد خدمة ${appointment.id}`} className="w-full h-full border-0" />
        </div>
        <DialogFooter className="px-5 py-3 border-t border-border shrink-0 flex-row gap-2">
          <Button variant="outline" className="rounded-xl" onClick={onClose}>إغلاق</Button>
          <Button className="rounded-xl gap-2 bg-[#8b5e2b] hover:bg-[#754d23] text-white" onClick={() => frameRef.current?.contentWindow?.print()}>
            <Printer className="w-4 h-4" />طباعة العقد
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
