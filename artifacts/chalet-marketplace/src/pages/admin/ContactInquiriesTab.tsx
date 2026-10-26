import { formatDateWithHijri } from "@/lib/hijri";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mail, Loader2, ChevronDown, MessageSquare, Clock, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const API = "/api";

interface ContactInquiryRow {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  message: string;
  status: "new" | "in_progress" | "answered";
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export function ContactInquiriesTab() {
  const { toast } = useToast();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [editingNotes, setEditingNotes] = useState<Record<number, string>>({});

  const { data: inquiries = [], isLoading, refetch } = useQuery<ContactInquiryRow[]>({
    queryKey: ["admin", "contact-inquiries"],
    queryFn: async () => {
      const r = await fetch(`${API}/admin/contact-inquiries`, { credentials: "include" });
      if (!r.ok) throw new Error("فشل التحميل");
      return r.json();
    },
  });

  async function updateStatus(id: number, status: string, adminNotes?: string) {
    setUpdatingId(id);
    try {
      const response = await fetch(`${API}/admin/contact-inquiries/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status, adminNotes }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "تعذّر حفظ التذكرة");
      }
      await refetch();
      setEditingNotes((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      toast({ title: "تم تحديث التذكرة" });
    } catch (error) {
      toast({
        title: "تعذّر حفظ التذكرة",
        description: error instanceof Error ? error.message : "حاول مرة أخرى",
        variant: "destructive",
      });
    } finally {
      setUpdatingId(null);
    }
  }

  const statusLabel = (s: string) => s === "new" ? "تذكرة جديدة" : s === "in_progress" ? "قيد المعالجة" : "تمت الإجابة";
  const statusIcon = (s: string) => s === "new" ? <MessageSquare className="w-3.5 h-3.5" /> : s === "in_progress" ? <Clock className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />;
  const statusColor = (s: string) => s === "new" ? "bg-amber-500/20 text-amber-300 border-amber-500/30" : s === "in_progress" ? "bg-blue-500/20 text-blue-300 border-blue-500/30" : "bg-green-500/20 text-green-300 border-green-500/30";
  
  const newCount = inquiries.filter((i) => i.status === "new").length;

  if (isLoading) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-400 w-6 h-6" /></div>;

  return (
    <div className="max-w-4xl space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Mail className="w-5 h-5 text-blue-400" />
          <h3 className="text-slate-100 font-bold text-lg">رسائل «اتصل بنا» (التذاكر)</h3>
          {newCount > 0 && (
            <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{newCount} جديد</span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="border-slate-600 text-slate-300 hover:text-white">
          تحديث التذاكر
        </Button>
      </div>

      {inquiries.length === 0 ? (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-12 text-center">
          <Mail className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-500">لا توجد رسائل تواصل حالياً.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {inquiries.map((inq) => {
            const isExpanded = expandedId === inq.id;
            const currentNotes = editingNotes[inq.id] !== undefined ? editingNotes[inq.id] : (inq.adminNotes || "");
            
            return (
              <div key={inq.id} className={`bg-slate-800 rounded-xl border overflow-hidden transition-colors ${inq.status === "new" ? "border-amber-500/40 shadow-sm shadow-amber-900/10" : "border-slate-700"}`}>
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none hover:bg-slate-800/80" onClick={() => setExpandedId(isExpanded ? null : inq.id)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap mb-1.5">
                      <span className="text-slate-100 font-semibold text-sm">#{inq.id} {inq.name}</span>
                      <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${statusColor(inq.status)}`}>
                        {statusIcon(inq.status)}
                        {statusLabel(inq.status)}
                      </span>
                    </div>
                    <p className="text-slate-400 text-xs truncate max-w-2xl">{inq.message}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-left hidden sm:block">
                      <p className="text-[10px] text-slate-500 mb-0.5">تاريخ الإرسال</p>
                      <p className="text-xs text-slate-400">{formatDateWithHijri(inq.createdAt || inq.updatedAt)}</p>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-700 px-4 pb-4 pt-4 space-y-5 bg-slate-900/30">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <div className="bg-slate-900/80 rounded-lg p-3 border border-slate-700">
                          <p className="text-xs text-slate-500 mb-1">الرسالة الأصلية</p>
                          <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{inq.message}</p>
                        </div>
                        
                        <div className="flex items-center gap-4 text-xs">
                          {inq.phone && (
                            <div className="flex items-center gap-2">
                              <span className="text-slate-500">الجوال:</span>
                              <span className="text-slate-300 font-mono" dir="ltr">{inq.phone}</span>
                              <a href={`https://wa.me/966${inq.phone.replace(/^0/, "").replace(/\D/g, "")}`}
                                target="_blank" rel="noreferrer"
                                className="px-2 py-0.5 rounded bg-[#25D366]/20 text-[#25D366] hover:bg-[#25D366]/30 transition-colors">
                                واتساب
                              </a>
                            </div>
                          )}
                          {inq.email && (
                            <div className="flex items-center gap-2">
                              <span className="text-slate-500">البريد:</span>
                              <span className="text-slate-300">{inq.email}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">ملاحظات الإدارة (داخلية)</label>
                          <Textarea 
                            value={currentNotes}
                            onChange={(e) => setEditingNotes(prev => ({ ...prev, [inq.id]: e.target.value }))}
                            placeholder="أضف ملاحظات حول حل المشكلة..."
                            className="bg-slate-900 border-slate-700 text-slate-300 text-sm h-24 resize-none"
                          />
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500">تحديث الحالة:</span>
                            {(["new", "in_progress", "answered"] as const).map((s) => (
                              <button key={s} type="button" disabled={updatingId === inq.id}
                                onClick={() => updateStatus(inq.id, s, currentNotes)}
                                className={`px-2.5 py-1 rounded-md text-xs border transition-colors disabled:opacity-50 ${inq.status === s ? statusColor(s) + " font-bold" : "bg-slate-800 border-slate-600 text-slate-400 hover:text-white hover:border-slate-500"}`}>
                                {updatingId === inq.id && inq.status === s ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : statusLabel(s)}
                              </button>
                            ))}
                          </div>
                          
                          {currentNotes !== (inq.adminNotes || "") && (
                            <Button size="sm" 
                              onClick={() => updateStatus(inq.id, inq.status, currentNotes)}
                              disabled={updatingId === inq.id}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white h-7 text-xs px-3">
                              حفظ الملاحظات
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
