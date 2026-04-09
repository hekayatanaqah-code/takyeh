import { useState, useRef } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Star, Upload, CheckCircle, X, Loader2, AlertCircle, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface InvitationInfo {
  chaletId: number;
  chaletName: string;
  chaletPhoto: string | null;
  guestName: string | null;
}

async function uploadFile(file: File): Promise<string | null> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${BASE}/api/storage/uploads/process`, {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.url ?? null;
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-2 justify-center" dir="ltr">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          className="transition-transform hover:scale-110 focus:outline-none"
          aria-label={`${star} نجوم`}
        >
          <Star
            className="w-10 h-10 transition-colors"
            fill={(hovered || value) >= star ? "#f59e0b" : "transparent"}
            stroke={(hovered || value) >= star ? "#f59e0b" : "#94a3b8"}
            strokeWidth={1.5}
          />
        </button>
      ))}
    </div>
  );
}

const RATING_LABELS: Record<number, string> = {
  1: "سيء جداً",
  2: "سيء",
  3: "مقبول",
  4: "جيد",
  5: "ممتاز!",
};

export default function RatePage() {
  const { token } = useParams<{ token: string }>();

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: info, isLoading, error } = useQuery<InvitationInfo>({
    queryKey: ["review-token", token],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/reviews/${token}`, { credentials: "include" });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? "error");
      }
      return r.json();
    },
    retry: false,
    staleTime: Infinity,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      setUploading(true);
      let photoUrls: string[] = [];
      try {
        const uploaded = await Promise.all(photos.map(uploadFile));
        photoUrls = uploaded.filter(Boolean) as string[];
      } finally {
        setUploading(false);
      }
      const r = await fetch(`${BASE}/api/reviews/${token}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment: comment.trim() || undefined, photoUrls, isAnonymous }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? "submission_error");
      }
      return r.json();
    },
    onSuccess: () => setSubmitted(true),
  });

  function handlePhotos(files: FileList | null) {
    if (!files) return;
    const newFiles = Array.from(files).slice(0, 5 - photos.length);
    setPhotos((p) => [...p, ...newFiles]);
    newFiles.forEach((f) => {
      const url = URL.createObjectURL(f);
      setPreviews((p) => [...p, url]);
    });
  }

  function removePhoto(i: number) {
    setPhotos((p) => p.filter((_, idx) => idx !== i));
    setPreviews((p) => {
      URL.revokeObjectURL(p[i]);
      return p.filter((_, idx) => idx !== i);
    });
  }

  /* ── States ── */
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center" dir="rtl">
        <Loader2 className="w-8 h-8 animate-spin text-green-600" />
      </div>
    );
  }

  if (error) {
    const msg = (error as Error).message;
    const isUsed = msg === "token_used";
    const isExpired = msg === "token_expired";
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center px-4" dir="rtl">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <AlertCircle className="w-14 h-14 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-800 mb-2">
            {isUsed ? "تم استخدام هذا الرابط" : isExpired ? "انتهت صلاحية الرابط" : "رابط غير صالح"}
          </h2>
          <p className="text-gray-500 text-sm">
            {isUsed
              ? "لقد تم تقديم تقييم باستخدام هذا الرابط من قبل."
              : isExpired
              ? "هذا الرابط لم يعد صالحاً، يرجى طلب رابط جديد."
              : "الرابط غير صحيح أو لم يعد متاحاً."}
          </p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center px-4" dir="rtl">
        <div className="bg-white rounded-2xl shadow-lg p-10 max-w-sm w-full text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">شكراً لك!</h2>
          <p className="text-gray-500 text-sm leading-relaxed">
            تم استلام تقييمك بنجاح. نقدّر وقتك وآراءك التي تساعدنا على تقديم أفضل خدمة.
          </p>
          <div className="flex justify-center gap-1 mt-6">
            {[1, 2, 3, 4, 5].map((s) => (
              <Star
                key={s}
                className="w-6 h-6"
                fill={s <= rating ? "#f59e0b" : "transparent"}
                stroke={s <= rating ? "#f59e0b" : "#94a3b8"}
                strokeWidth={1.5}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center px-4 py-10" dir="rtl">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md overflow-hidden">
        {/* Chalet cover */}
        {info?.chaletPhoto && (
          <div className="h-36 w-full overflow-hidden">
            <img
              src={info.chaletPhoto}
              alt={info?.chaletName}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="p-7">
          {/* Header */}
          <div className="text-center mb-6">
            {info?.guestName && (
              <p className="text-green-600 font-semibold text-sm mb-1">أهلاً، {info.guestName}!</p>
            )}
            <p className="text-gray-500 text-sm mb-1">تقييم تجربتك في</p>
            <h1 className="text-xl font-bold text-gray-800">{info?.chaletName}</h1>
          </div>

          {/* Star Rating */}
          <div className="mb-5 text-center">
            <p className="text-sm text-gray-500 mb-3 font-medium">كيف كانت تجربتك؟</p>
            <StarRating value={rating} onChange={setRating} />
            {rating > 0 && (
              <p className="mt-2 text-sm font-semibold text-amber-600">{RATING_LABELS[rating]}</p>
            )}
          </div>

          {/* Comment */}
          <div className="mb-5">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              تعليقك (اختياري)
            </label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="شاركنا تجربتك..."
              rows={4}
              maxLength={2000}
              className="resize-none text-right"
            />
            <p className="text-xs text-gray-400 text-left mt-1">{comment.length}/2000</p>
          </div>

          {/* Photo Upload */}
          <div className="mb-5">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              صور (اختياري — حتى 5 صور)
            </label>

            {previews.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {previews.map((src, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200">
                    <img src={src} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removePhoto(i)}
                      className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center hover:bg-red-600"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {photos.length < 5 && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-2 text-sm text-green-700 border border-dashed border-green-400 rounded-lg px-4 py-2.5 hover:bg-green-50 transition-colors w-full justify-center"
              >
                <Upload className="w-4 h-4" />
                إضافة صورة
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handlePhotos(e.target.files)}
            />
          </div>

          {/* Anonymous Toggle */}
          <div className="mb-6">
            <label className="flex items-center gap-3 cursor-pointer select-none group">
              <div
                className={`relative w-10 h-6 rounded-full transition-colors duration-200 ${isAnonymous ? "bg-green-500" : "bg-gray-200"}`}
                onClick={() => setIsAnonymous((v) => !v)}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${isAnonymous ? "translate-x-4 right-0.5" : "right-4"}`}
                />
              </div>
              <span className="flex items-center gap-1.5 text-sm text-gray-700">
                <EyeOff className="w-3.5 h-3.5 text-gray-400" />
                نشر كتقييم مجهول
              </span>
            </label>
            <p className="text-xs text-gray-400 mt-1 pr-13">
              {isAnonymous ? "سيظهر تقييمك باسم «نزيل مؤكد»" : "سيظهر اسمك الأول مع الحرف الأول من اللقب"}
            </p>
          </div>

          {/* Submit */}
          {submitMutation.error && (
            <p className="text-sm text-red-500 mb-3 text-center">
              حدث خطأ أثناء الإرسال، يرجى المحاولة مجدداً.
            </p>
          )}

          <Button
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold h-12 text-base"
            disabled={rating === 0 || submitMutation.isPending || uploading}
            onClick={() => submitMutation.mutate()}
          >
            {submitMutation.isPending || uploading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                جارٍ الإرسال...
              </span>
            ) : (
              "إرسال التقييم"
            )}
          </Button>

          <p className="text-xs text-gray-400 text-center mt-3">
            هذا الرابط للاستخدام مرة واحدة فقط
          </p>
        </div>
      </div>
    </div>
  );
}
