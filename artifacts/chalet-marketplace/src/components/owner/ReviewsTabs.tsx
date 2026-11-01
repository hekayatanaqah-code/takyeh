import { formatDateWithHijri, HIJRI_MONTHS_AR, toHijriComponents, getHijriMonthGregorianRange } from "@/lib/hijri";
import { useEffect, useState, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { Plus, CheckCircle, Trash2, Building2, Phone, RotateCcw, Star, ChevronDown, ChevronUp, Loader2, Mail, MessageSquare, ExternalLink } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ReviewObjection } from "@/components/owner/ReviewObjection";
import { motion } from "framer-motion";
import { toAr } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { useServiceErp } from "@/components/owner/OwnerDashboardContexts";
import { BASE, apiFetch } from "@/components/owner/owner-api";
import { encodeWhatsAppText } from "@/components/owner/owner-message-templates";
import { toArN } from "@/components/owner/owner-formatting";
import { SectionGuideButton } from "@/components/owner/SectionGuideButton";
import { GREGORIAN_MONTHS_AR, getCalCorrespondenceHint } from "@/components/owner/owner-calendar";


/* ── Reviews Tab ─────────────────────────────── */
export interface OwnerChalet { id: number; nameAr: string; photos: string[]; waReviewTemplate: string | null }

const DEFAULT_REVIEW_TEMPLATE = "أهلاً [اسم الضيف]، يسعدنا تقييمك لتجربتك في [اسم الشاليه].\nاضغط هنا لتقييمك: [الرابط]";

function fmtDT(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const time = d.toLocaleTimeString("ar-SA", { timeZone: "Asia/Riyadh", hour: "numeric", minute: "2-digit", hour12: true });
    return `${formatDateWithHijri(d)} (${time})`;
  } catch { return iso; }
}

interface OwnerReviewRow {
  id: number;
  chaletId: number;
  chaletName: string | null;
  guestName: string | null;
  rating: number;
  comment: string | null;
  photoUrls: string[];
  isVerified: boolean;
  isHidden: boolean;
  ownerReply: string | null;
  ownerReplyAt: string | null;
  reportedBy: string | null;
  reportedAt: string | null;
  createdAt: string;
}

/* ── InvitationsTable: compact collapsible table for sent invitations ── */
interface InvItem {
  id: number;
  token: string;
  used: boolean;
  guestName: string | null;
  createdAt: string;
}
function InvitationsTable({ invitations, onDelete, deleteIsPending }: { invitations: InvItem[]; onDelete: (id: number) => void; deleteIsPending: boolean }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const copyLink = (token: string) => {
    const url = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/r/${token}`;
    navigator.clipboard.writeText(url).then(() => toast({ title: "تم النسخ", description: "رابط الدعوة في الحافظة" }));
  };
  const pending = invitations.filter((i) => !i.used).length;
  const used    = invitations.filter((i) => i.used).length;
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-sm"
      >
        <div className="flex items-center gap-3">
          <Mail className="w-4 h-4 text-muted-foreground" />
          <span className="font-semibold text-foreground">الدعوات المرسلة</span>
          <span className="text-xs text-muted-foreground">({invitations.length})</span>
          {pending > 0 && <span className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{pending} معلق</span>}
          {used > 0   && <span className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{used} مستخدم</span>}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/20 text-muted-foreground text-xs border-b border-border">
                <th className="text-right px-4 py-2 font-medium">الاسم</th>
                <th className="text-right px-4 py-2 font-medium">الحالة</th>
                <th className="text-right px-4 py-2 font-medium">التاريخ</th>
                <th className="text-center px-4 py-2 font-medium">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {invitations.map((inv) => (
                <tr key={inv.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2.5 text-foreground">{inv.guestName || <span className="text-muted-foreground italic text-xs">ضيف</span>}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${inv.used ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${inv.used ? "bg-green-500" : "bg-amber-400"}`} />
                      {inv.used ? "مستخدم" : "معلق"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground text-[11px] leading-relaxed">
                    {fmtDT(inv.createdAt)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => copyLink(inv.token)}
                        title="نسخ الرابط"
                        className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDelete(inv.id)}
                        disabled={deleteIsPending}
                        title="حذف الدعوة"
                        className="p-1.5 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ServiceReviewsTab() {
  const { providerId } = useServiceErp();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [generatedLink, setGeneratedLink] = useState("");
  const [replyDraft, setReplyDraft] = useState<Record<number, string>>({});
  const [replyingId, setReplyingId] = useState<number | null>(null);

  const { data: reviews = [], isLoading, isError: serviceReviewsError, refetch: refetchServiceReviews } = useQuery<any[]>({
    queryKey: ["service-reviews", providerId],
    queryFn: async () => {
      const r = await apiFetch(`/providers/my/approved/${providerId}/reviews`);
      if (!r.ok) throw new Error("تعذر تحميل تقييمات الخدمة");
      return r.json();
    },
    enabled: !!providerId,
    refetchInterval: 30_000,
  });

  const invite = useMutation({
    mutationFn: async () => {
      const r = await apiFetch(`/providers/my/approved/${providerId}/review-invite`, { method: "POST" });
      if (!r.ok) throw new Error("تعذر إنشاء الرابط");
      return r.json() as Promise<{ token: string }>;
    },
    onSuccess: ({ token }) => {
      setGeneratedLink(`${window.location.origin}${BASE}/r/${token}`);
      toast({ title: "تم إنشاء رابط التقييم" });
    },
    onError: () => toast({ title: "تعذر إنشاء رابط التقييم", variant: "destructive" }),
  });

  const reply = useMutation({
    mutationFn: async ({ reviewId, text }: { reviewId: number; text: string }) => {
      const r = await apiFetch(`/providers/my/approved/${providerId}/reviews/${reviewId}/reply`, {
        method: "POST",
        body: JSON.stringify({ reply: text }),
      });
      if (!r.ok) throw new Error();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["service-reviews", providerId] });
      setReplyingId(null);
      toast({ title: "تم حفظ الرد" });
    },
    onError: () => toast({ title: "تعذر حفظ الرد", variant: "destructive" }),
  });

  return (
    <div className="space-y-5">
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-bold text-lg text-foreground flex items-center gap-2"><Star className="w-5 h-5 text-amber-500" />تقييمات الخدمة</h2>
            <p className="text-sm text-muted-foreground mt-1">أنشئ رابطاً خاصاً ليقيّم العميل تجربته مع هذه الخدمة.</p>
          </div>
          <Button onClick={() => invite.mutate()} disabled={invite.isPending} className="rounded-xl gap-2">
            {invite.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            إنشاء رابط تقييم
          </Button>
        </div>
        {generatedLink && (
          <div className="flex flex-col sm:flex-row gap-2">
            <Input value={generatedLink} readOnly dir="ltr" className="flex-1" />
            <Button variant="outline" className="rounded-xl" onClick={() => {
              navigator.clipboard.writeText(generatedLink);
              toast({ title: "تم نسخ الرابط" });
            }}>نسخ الرابط</Button>
          </div>
        )}
      </div>

      {serviceReviewsError ? (
        <div role="alert" className="rounded-xl border border-red-300 p-4 text-red-600">
          تعذر تحميل تقييمات الخدمة.
          <Button variant="outline" size="sm" className="mr-2" onClick={() => void refetchServiceReviews()}>إعادة المحاولة</Button>
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : reviews.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center text-muted-foreground">
          <Star className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">لا توجد تقييمات لهذه الخدمة بعد</p>
          <p className="text-xs mt-1">أنشئ رابطاً وأرسله للعميل بعد اكتمال الخدمة.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((review) => (
            <div key={review.id} className="bg-card border border-border rounded-2xl p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-amber-500" dir="ltr">{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</p>
                  <p className="text-xs text-muted-foreground mt-1">{review.isAnonymous ? "عميل مجهول" : (review.guestName || "عميل الخدمة")}</p>
                </div>
                <span className="text-xs text-muted-foreground">{fmtDT(review.createdAt)}</span>
              </div>
              {review.comment && <p className="text-sm text-foreground leading-relaxed">{review.comment}</p>}
              {review.ownerReply ? (
                <div className="rounded-xl bg-muted/50 p-3 text-sm"><span className="font-bold">رد المالك: </span>{review.ownerReply}</div>
              ) : replyingId === review.id ? (
                <div className="space-y-2">
                  <Textarea value={replyDraft[review.id] ?? ""} onChange={e => setReplyDraft(p => ({ ...p, [review.id]: e.target.value }))} placeholder="اكتب ردك..." />
                  <div className="flex gap-2 justify-end">
                    <Button variant="ghost" size="sm" onClick={() => setReplyingId(null)}>إلغاء</Button>
                    <Button size="sm" disabled={!replyDraft[review.id]?.trim() || reply.isPending} onClick={() => reply.mutate({ reviewId: review.id, text: replyDraft[review.id] })}>حفظ الرد</Button>
                  </div>
                </div>
              ) : null}
              <ReviewObjection endpoint={`/providers/my/approved/${providerId}/reviews/${review.id}/report`}
                reportedAt={review.reportedAt} request={apiFetch} refreshKey={["service-reviews", providerId]}
                replyAction={!review.ownerReply && replyingId !== review.id ? (
                  <Button variant="outline" size="sm" onClick={() => setReplyingId(review.id)}>الرد على التقييم</Button>
                ) : null} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ReviewsTab() {
  const qc = useQueryClient();
  const [selectedChaletId, setSelectedChaletId] = useState<number | null>(null);
  const [generatedLinks, setGeneratedLinks] = useState<Record<number, string>>({});
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [templateDraft, setTemplateDraft] = useState<Record<number, string>>({});
  const [templateSaved, setTemplateSaved] = useState<number | null>(null);
  const [replyDraft, setReplyDraft] = useState<Record<number, string>>({});
  const [replyingId, setReplyingId] = useState<number | null>(null);
  const [reviewCalType, setReviewCalType] = useState<"gregorian" | "hijri">("hijri");
  const [reviewYear, setReviewYear] = useState<string>(String(toHijriComponents(new Date()).year));
  const [reviewMonth, setReviewMonth] = useState<string>("");

  const { data: siteSettings = {} } = useQuery<Record<string, string>>({
    queryKey: ["siteSettings"],
    queryFn: async () => {
      const r = await fetch("/api/page-content");
      if (!r.ok) return {};
      return r.json();
    },
    staleTime: 60_000,
  });

  const { data: chalets = [], isLoading } = useQuery<OwnerChalet[]>({
    queryKey: ["owner", "chalets"],
    queryFn: async () => {
      const r = await apiFetch("/owner/chalets");
      if (!r.ok) return [];
      return r.json();
    },
  });

  useEffect(() => {
    if (chalets.length > 0 && selectedChaletId === null) {
      setSelectedChaletId(chalets[0].id);
    }
  }, [chalets, selectedChaletId]);

  const { data: invitations = [] } = useQuery<{ id: number; chaletId: number; token: string; used: boolean; guestName: string | null; createdAt: string }[]>({
    queryKey: ["owner", "review-invitations"],
    queryFn: async () => {
      const r = await apiFetch("/owner/review-invitations");
      if (!r.ok) return [];
      return r.json();
    },
  });

  const generateLink = useMutation({
    mutationFn: async (chaletId: number) => {
      const r = await apiFetch("/owner/review-invite", {
        method: "POST",
        body: JSON.stringify({ chaletId }),
      });
      if (!r.ok) throw new Error("failed");
      return r.json() as Promise<{ token: string; chaletName: string }>;
    },
    onSuccess: (data, chaletId) => {
      const origin = window.location.origin;
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const link = `${origin}${base}/r/${data.token}`;
      setGeneratedLinks((prev) => ({ ...prev, [chaletId]: link }));
      qc.invalidateQueries({ queryKey: ["owner", "review-invitations"] });
    },
  });

  const deleteInvitation = useMutation({
    mutationFn: async (invId: number) => {
      const r = await apiFetch(`/owner/review-invitations/${invId}`, { method: "DELETE" });
      if (!r.ok) throw new Error("failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owner", "review-invitations"] }),
  });

  const saveTemplate = useMutation({
    mutationFn: async ({ chaletId, template }: { chaletId: number; template: string }) => {
      const r = await apiFetch(`/owner/chalets/${chaletId}/review-template`, {
        method: "PATCH",
        body: JSON.stringify({ waReviewTemplate: template }),
      });
      if (!r.ok) throw new Error("failed");
    },
    onSuccess: (_, { chaletId }) => {
      qc.invalidateQueries({ queryKey: ["owner", "chalets"] });
      setTemplateSaved(chaletId);
      setTimeout(() => setTemplateSaved(null), 2500);
    },
  });

  const { data: ownerReviews = [], isLoading: reviewsLoading } = useQuery<OwnerReviewRow[]>({
    queryKey: ["owner", "reviews"],
    queryFn: async () => {
      const r = await apiFetch("/owner/reviews");
      if (!r.ok) throw new Error("تعذر تحميل التقييمات");
      return r.json();
    },
    refetchInterval: 30_000,
  });

  const replyMutation = useMutation({
    mutationFn: async ({ reviewId, reply }: { reviewId: number; reply: string }) => {
      const r = await apiFetch(`/owner/reviews/${reviewId}/reply`, {
        method: "POST",
        body: JSON.stringify({ reply }),
      });
      if (!r.ok) throw new Error("failed");
    },
    onSuccess: (_, { reviewId }) => {
      qc.invalidateQueries({ queryKey: ["owner", "reviews"] });
      setReplyingId(null);
      setReplyDraft((prev) => { const next = { ...prev }; delete next[reviewId]; return next; });
    },
  });

  function copyLink(chaletId: number) {
    const link = generatedLinks[chaletId];
    if (!link) return;
    navigator.clipboard.writeText(link);
    setCopiedId(chaletId);
    setTimeout(() => setCopiedId(null), 2500);
  }

  function sendWhatsApp(chalet: OwnerChalet) {
    const link = generatedLinks[chalet.id];
    if (!link) return;
    const template =
      templateDraft[chalet.id] ??
      chalet.waReviewTemplate ??
      siteSettings.wa_review_template ??
      DEFAULT_REVIEW_TEMPLATE;
    const text = template
      .replace(/\[الرابط\]/g, link)
      .replace(/\{link\}/g, link)
      .replace(/\[اسم[ _]الشاليه\]/g, chalet.nameAr ?? "عقارنا")
      .replace(/\{chalet_name\}/g, chalet.nameAr ?? "عقارنا")
      .replace(/\[اسم[ _]الضيف\]/g, "")
      .replace(/\{guest_name\}/g, "");
    window.open(`https://wa.me/?text=${encodeWhatsAppText(text)}`, "_blank");
  }

  function inviteStats(chaletId: number) {
    const all = invitations.filter((i) => i.chaletId === chaletId);
    return { total: all.length, used: all.filter((i) => i.used).length, pending: all.filter((i) => !i.used).length };
  }

  const selectedChalet = chalets.find((c) => c.id === selectedChaletId) ?? null;

  /* ── Reviews: cascading filter data ── */
  const chaletReviewsAll = useMemo(() =>
    selectedChalet ? ownerReviews.filter(r => r.chaletId === selectedChalet.id) : [],
  [ownerReviews, selectedChalet]);

  const reviewYearOptions = useMemo(() => {
    const years = new Set<string>();
    chaletReviewsAll.forEach(r => {
      const d = new Date(r.createdAt);
      years.add(reviewCalType === "gregorian" ? String(d.getFullYear()) : String(toHijriComponents(d).year));
    });
    years.add(reviewCalType === "gregorian" ? String(new Date().getFullYear()) : String(toHijriComponents(new Date()).year));
    return Array.from(years).sort().reverse();
  }, [chaletReviewsAll, reviewCalType]);

  const reviewMonthOptions = useMemo(() => {
    if (!reviewYear) return [] as string[];
    const months = new Set<string>();
    chaletReviewsAll.forEach(r => {
      const d = new Date(r.createdAt);
      if (reviewCalType === "gregorian") {
        if (String(d.getFullYear()) === reviewYear) months.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`);
      } else {
        const h = toHijriComponents(d);
        if (String(h.year) === reviewYear) months.add(`${h.year}-${String(h.month).padStart(2,"0")}`);
      }
    });
    const curYear = reviewCalType === "gregorian" ? String(new Date().getFullYear()) : String(toHijriComponents(new Date()).year);
    if (reviewYear === curYear) {
      const d = new Date();
      if (reviewCalType === "gregorian") months.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`);
      else { const h = toHijriComponents(d); months.add(`${h.year}-${String(h.month).padStart(2,"0")}`); }
    }
    return Array.from(months).sort().reverse();
  }, [chaletReviewsAll, reviewCalType, reviewYear]);

  const filteredChaletReviews = useMemo(() => {
    if (!reviewYear) return chaletReviewsAll;
    return chaletReviewsAll.filter(r => {
      const d = new Date(r.createdAt);
      if (reviewCalType === "gregorian") {
        if (String(d.getFullYear()) !== reviewYear) return false;
        if (!reviewMonth) return true;
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}` === reviewMonth;
      } else {
        const h = toHijriComponents(d);
        if (String(h.year) !== reviewYear) return false;
        if (!reviewMonth) return true;
        return `${h.year}-${String(h.month).padStart(2,"0")}` === reviewMonth;
      }
    });
  }, [chaletReviewsAll, reviewCalType, reviewYear, reviewMonth]);

  const reviewMonthParts = (ym: string): { primary: string; secondary: string } => {
    const [y, m] = ym.split("-").map(Number);
    const gregMonthName = (gy: number, gm: number) =>
      new Date(gy, gm, 15).toLocaleDateString("ar-SA", { month: "long", calendar: "gregory" });
    if (reviewCalType === "hijri") {
      const primary = `${HIJRI_MONTHS_AR[m - 1]} ${toArN(y)} هـ`;
      const { start, end } = getHijriMonthGregorianRange(y, m);
      let secondary = "";
      if (start && end) {
        const s = new Date(start + "T00:00:00"), e = new Date(end + "T00:00:00");
        const sY = s.getFullYear(), sM = s.getMonth(), eY = e.getFullYear(), eM = e.getMonth();
        if (sY === eY && sM === eM) secondary = `${gregMonthName(sY, sM)} ${toArN(sY)}`;
        else if (sY === eY) secondary = `${gregMonthName(sY, sM)} / ${gregMonthName(eY, eM)} ${toArN(sY)}`;
        else secondary = `${gregMonthName(sY, sM)} ${toArN(sY)} / ${gregMonthName(eY, eM)} ${toArN(eY)}`;
      }
      return { primary, secondary };
    }
    const primary = `${gregMonthName(y, m - 1)} ${toArN(y)}`;
    const h1 = toHijriComponents(new Date(y, m - 1, 1)), h2 = toHijriComponents(new Date(y, m, 0));
    let secondary = "";
    if (h1.year === h2.year && h1.month === h2.month) secondary = `${HIJRI_MONTHS_AR[h1.month-1]} ${toArN(h1.year)} هـ`;
    else if (h1.year === h2.year) secondary = `${HIJRI_MONTHS_AR[h1.month-1]} / ${HIJRI_MONTHS_AR[h2.month-1]} ${toArN(h1.year)} هـ`;
    else secondary = `${HIJRI_MONTHS_AR[h1.month-1]} ${toArN(h1.year)} / ${HIJRI_MONTHS_AR[h2.month-1]} ${toArN(h2.year)} هـ`;
    return { primary, secondary };
  };

  const currentLink = selectedChaletId ? generatedLinks[selectedChaletId] : null;
  const stats = selectedChaletId ? inviteStats(selectedChaletId) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center">
            <Star className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-bold text-lg text-foreground">إرسال رابط التقييم للضيوف</h2>
              <SectionGuideButton sectionKey="reviews" />
            </div>
            <p className="text-muted-foreground text-sm">أنشئ رابطاً خاصاً لكل ضيف ليقيّم تجربته</p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
      ) : chalets.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center text-muted-foreground">
          <Building2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>لا توجد عقارات مرتبطة بحسابك بعد</p>
        </div>
      ) : (
        <>
          {/* Chalet selector */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <p className="text-sm font-semibold text-foreground mb-3">اختر العقار</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {chalets.map((c) => {
                const selected = selectedChaletId === c.id;
                const st = inviteStats(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedChaletId(c.id)}
                    className={`flex items-center gap-3 p-4 rounded-xl border text-right transition-all ${
                      selected
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                        : "border-border hover:border-primary/40 hover:bg-muted/30"
                    }`}
                  >
                    {c.photos?.[0] ? (
                      <img src={c.photos[0]} alt={c.nameAr} className="w-12 h-12 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <Building2 className="w-6 h-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground text-sm truncate">{c.nameAr}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {st.total === 0 ? "لا توجد دعوات مرسلة" : `${toAr(st.total)} دعوة — ${toAr(st.used)} مستخدمة`}
                      </p>
                    </div>
                    {selected && <CheckCircle className="w-4 h-4 text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Generate + Send section */}
          {selectedChalet && (
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-5">
              {/* Title + generate button */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="font-bold text-foreground">{selectedChalet.nameAr}</p>
                  {stats && stats.total > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {toAr(stats.total)} دعوة إجمالاً · {toAr(stats.pending)} معلقة · {toAr(stats.used)} مستخدمة
                    </p>
                  )}
                </div>
                <Button
                  onClick={() => generateLink.mutate(selectedChalet.id)}
                  disabled={generateLink.isPending}
                  className="gap-2 bg-primary hover:bg-primary/90"
                >
                  {generateLink.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className="w-4 h-4" />}
                  إنشاء رابط تقييم جديد
                </Button>
              </div>

              {/* Generated link + send */}
              {currentLink && (
                <div className="bg-muted/40 rounded-xl border border-border p-4 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">الرابط الجديد (صالح لمدة 30 يوماً)</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-background border border-border text-primary text-xs px-3 py-2.5 rounded-lg font-mono break-all">
                      {currentLink}
                    </code>
                    <Button size="sm" variant="outline" onClick={() => copyLink(selectedChalet.id)} className="shrink-0">
                      {copiedId === selectedChalet.id ? "✓ تم النسخ" : "نسخ"}
                    </Button>
                  </div>
                  <Button
                    className="w-full gap-2 bg-[#25D366] hover:bg-[#1ebe5a] text-white font-semibold"
                    onClick={() => sendWhatsApp(selectedChalet)}
                  >
                    <Phone className="w-4 h-4" />
                    إرسال عبر واتساب
                  </Button>
                </div>
              )}

              {/* Custom WhatsApp message template per chalet */}
              <div className="border border-border rounded-xl p-4 space-y-3 bg-muted/20">
                <div className="flex items-center gap-2 flex-wrap">
                  <MessageSquare className="w-4 h-4 text-muted-foreground" />
                  <p className="text-sm font-semibold text-foreground">رسالة واتساب مخصصة</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1.5 mr-auto"
                    disabled={saveTemplate.isPending}
                    onClick={() => {
                      setTemplateDraft((prev) => ({
                        ...prev,
                        [selectedChalet.id]: siteSettings.wa_review_template?.trim()
                          ? siteSettings.wa_review_template
                          : DEFAULT_REVIEW_TEMPLATE,
                      }));
                      setTemplateSaved(null);
                    }}
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    استعادة النص الافتراضي
                  </Button>
                  <span className="text-xs text-muted-foreground w-full">ضع [الرابط] حيث تريد رابط التقييم</span>
                </div>
                <Textarea
                  dir="rtl"
                  rows={4}
                  placeholder={selectedChalet.waReviewTemplate ?? siteSettings.wa_review_template ?? DEFAULT_REVIEW_TEMPLATE}
                  value={templateDraft[selectedChalet.id] ?? selectedChalet.waReviewTemplate ?? ""}
                  onChange={(e) =>
                    setTemplateDraft((prev) => ({ ...prev, [selectedChalet.id]: e.target.value }))
                  }
                  className="text-sm resize-none"
                />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">اترك الحقل فارغاً لاستخدام القالب الافتراضي الذي يضبطه الأدمن</p>
                  <Button
                    size="sm"
                    disabled={saveTemplate.isPending}
                    onClick={() =>
                      saveTemplate.mutate({
                        chaletId: selectedChalet.id,
                        template: templateDraft[selectedChalet.id] ?? selectedChalet.waReviewTemplate ?? "",
                      })
                    }
                    className="gap-1.5 shrink-0"
                  >
                    {saveTemplate.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : templateSaved === selectedChalet.id ? (
                      "✓ تم الحفظ"
                    ) : (
                      "حفظ الرسالة"
                    )}
                  </Button>
                </div>
              </div>

              {/* Invitations list — collapsible compact table */}
              {stats && stats.total > 0 && (
                <InvitationsTable
                  invitations={invitations.filter((i) => i.chaletId === selectedChalet.id)}
                  onDelete={(id) => deleteInvitation.mutate(id)}
                  deleteIsPending={deleteInvitation.isPending}
                />
              )}
            </div>
          )}

          {/* ── Submitted Reviews for selected chalet ── */}
          {selectedChalet && (
            reviewsLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : chaletReviewsAll.length === 0 ? (
              <div className="bg-card border border-border rounded-2xl p-6 text-center text-muted-foreground text-sm">
                <Star className="w-8 h-8 mx-auto mb-2 opacity-30" />
                لا توجد تقييمات مستلمة لهذا العقار بعد
              </div>
            ) : (
              <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4">
                {/* Filter bar */}
                <div className="flex items-center gap-2 flex-wrap justify-between">
                  <p className="font-bold text-foreground shrink-0">
                    التقييمات الواردة ({toAr(filteredChaletReviews.length)})
                  </p>
                  <div className="flex items-center gap-2 flex-nowrap">
                    {/* Calendar toggle */}
                    <div className="flex rounded-lg border border-border overflow-hidden text-xs shrink-0">
                      {(["gregorian", "hijri"] as const).map(mode => (
                        <button key={mode}
                          onClick={() => {
                            const yr = mode === "hijri" ? String(toHijriComponents(new Date()).year) : String(new Date().getFullYear());
                            setReviewCalType(mode); setReviewYear(yr); setReviewMonth("");
                          }}
                          className={`px-3 py-1.5 font-medium transition-colors ${reviewCalType === mode ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                        >
                          {mode === "gregorian" ? "ميلادي" : "هجري"}
                        </button>
                      ))}
                    </div>
                    {/* Year dropdown — includes "كل السنوات" */}
                    <Select value={reviewYear || "__all__"} onValueChange={yr => { setReviewYear(yr === "__all__" ? "" : yr); setReviewMonth(""); }}>
                      <SelectTrigger className="h-9 text-sm rounded-lg border-border w-[7rem] shrink-0" dir="rtl">
                        {reviewYear
                          ? <span className="text-sm font-medium">{reviewCalType === "hijri" ? `${toArN(Number(reviewYear))} هـ` : `${toArN(Number(reviewYear))} م`}</span>
                          : <span className="text-sm text-muted-foreground">كل السنوات</span>}
                      </SelectTrigger>
                      <SelectContent dir="rtl" align="end">
                        <SelectItem value="__all__"><span className="text-sm">كل السنوات</span></SelectItem>
                        {reviewYearOptions.map(yr => (
                          <SelectItem key={yr} value={yr}>
                            {reviewCalType === "hijri" ? `${toArN(Number(yr))} هـ` : `${toArN(Number(yr))} م`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {/* Month dropdown — locked to "كل التقييمات" when no year selected */}
                    <Select
                      value={!reviewYear ? "__all__" : (reviewMonth || "__all__")}
                      onValueChange={v => { if (reviewYear) setReviewMonth(v === "__all__" ? "" : v); }}
                      disabled={!reviewYear}
                    >
                      <SelectTrigger className="h-9 text-sm rounded-lg border-border w-[7.5rem] shrink-0" dir="rtl">
                        {reviewMonth && reviewYear
                          ? <span className="text-sm font-medium">
                              {(() => {
                                const ms = Number(reviewMonth.split("-")[1]);
                                return reviewCalType === "hijri" ? HIJRI_MONTHS_AR[ms - 1] : GREGORIAN_MONTHS_AR[ms - 1];
                              })()}
                            </span>
                          : <span className="text-sm text-muted-foreground">كل التقييمات</span>}
                      </SelectTrigger>
                      <SelectContent dir="rtl" align="end">
                        <SelectItem value="__all__"><span className="text-sm">كل التقييمات</span></SelectItem>
                        {reviewMonthOptions.map(ym => {
                          const [ys, ms] = ym.split("-").map(Number);
                          const primary = reviewCalType === "hijri" ? `${HIJRI_MONTHS_AR[ms-1]} ${toArN(ys)} هـ` : `${GREGORIAN_MONTHS_AR[ms-1]} ${toArN(ys)} م`;
                          const corr = getCalCorrespondenceHint(ym, reviewCalType);
                          return (
                            <SelectItem key={ym} value={ym} textValue={primary}>
                              <div style={{width:"100%",direction:"rtl"}}>
                                <div style={{fontWeight:"600",fontSize:"13px",textAlign:"right"}}>{primary}</div>
                                {corr && <div style={{fontSize:"11px",color:"#888",textAlign:"right",marginTop:"1px"}}>{corr}</div>}
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {/* Reviews list */}
                {filteredChaletReviews.length === 0 ? (
                  <div className="text-center text-muted-foreground text-sm py-6">لا توجد تقييمات في هذه الفترة</div>
                ) : filteredChaletReviews.map((rev) => (
                  <div key={rev.id} className={`rounded-xl border p-4 space-y-3 ${rev.isHidden ? "border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-800" : "border-border bg-muted/30"}`}>
                    {/* Header */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex gap-0.5" dir="ltr">
                        {[1,2,3,4,5].map((s) => (
                          <Star key={s} className="w-4 h-4" fill={s <= rev.rating ? "#f59e0b" : "transparent"} stroke={s <= rev.rating ? "#f59e0b" : "#9ca3af"} strokeWidth={1.5} />
                        ))}
                      </div>
                      {rev.guestName && (
                        <span className="text-xs font-medium text-foreground bg-muted/50 px-2 py-0.5 rounded-full">{rev.guestName}</span>
                      )}
                      {rev.isVerified && (
                        <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
                          <CheckCircle className="w-3.5 h-3.5" /> نزيل مؤكد
                        </span>
                      )}
                      {rev.isHidden && (
                        <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full font-medium">
                          مخفي من قبل الإدارة
                        </span>
                      )}
                      {rev.reportedAt && !rev.isHidden && (
                        <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">
                          اعتراض قيد المراجعة
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground mr-auto leading-relaxed">
                        {fmtDT(rev.createdAt)}
                      </span>
                    </div>

                    {/* Comment */}
                    {rev.comment && <p className="text-sm text-foreground leading-relaxed">{rev.comment}</p>}

                    {/* Photos */}
                    {rev.photoUrls?.length > 0 && (
                      <div className="flex gap-2 flex-wrap">
                        {rev.photoUrls.map((url, i) => (
                          <img key={i} src={url} alt="" className="w-14 h-14 rounded-lg object-cover border border-border cursor-pointer"
                            onClick={() => window.open(url, "_blank")}
                          />
                        ))}
                      </div>
                    )}

                    {/* Owner reply (existing) */}
                    {rev.ownerReply && replyingId !== rev.id && (
                      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 space-y-1">
                        <p className="text-xs font-semibold text-green-700 dark:text-green-400">ردك على التقييم</p>
                        <p className="text-sm text-foreground leading-relaxed">{rev.ownerReply}</p>
                      </div>
                    )}

                    {/* Reply form */}
                    {replyingId === rev.id ? (
                      <div className="space-y-2">
                        <Textarea
                          dir="rtl"
                          rows={3}
                          placeholder="اكتب ردك على هذا التقييم..."
                          value={replyDraft[rev.id] ?? ""}
                          onChange={(e) => setReplyDraft((p) => ({ ...p, [rev.id]: e.target.value }))}
                          className="text-sm resize-none"
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="default"
                            className={`gap-1.5 transition-opacity duration-150 ${(replyDraft[rev.id] ?? "").trim() ? "opacity-100" : "opacity-40"}`}
                            disabled={replyMutation.isPending || !(replyDraft[rev.id] ?? "").trim()}
                            onClick={() => replyMutation.mutate({ reviewId: rev.id, reply: (replyDraft[rev.id] ?? "").trim() })}
                          >
                            {replyMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                            نشر الرد
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setReplyingId(null)}>إلغاء</Button>
                        </div>
                      </div>
                    ) : null}

                    <ReviewObjection endpoint={`/owner/reviews/${rev.id}/report`}
                      reportedAt={rev.reportedAt} request={apiFetch} refreshKey={["owner", "reviews"]}
                      replyAction={replyingId !== rev.id ? (
                        <Button variant="outline" size="sm"
                          onClick={() => { setReplyingId(rev.id); setReplyDraft(p => ({ ...p, [rev.id]: rev.ownerReply ?? "" })); }}>
                          {rev.ownerReply ? "تعديل الرد" : "الرد على التقييم"}
                        </Button>
                      ) : null} />
                  </div>
                ))}
              </div>
            )
          )}

          {/* Tip card when nothing selected */}
          {!selectedChalet && (
            <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-2xl p-5 text-sm text-amber-800 dark:text-amber-300 flex gap-3">
              <Star className="w-5 h-5 shrink-0 mt-0.5 text-amber-500" />
              <p>اختر عقاراً من الأعلى لإنشاء رابط التقييم وإرساله عبر واتساب للضيف مباشرة</p>
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
