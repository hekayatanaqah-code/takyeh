import { useState } from "react";
import { API, EXPERIENCE_AR, type Photographer } from "./shared";

function safePortfolioUrl(value?: string) {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export function PhotographerReviewDetails({ p }: { p: Photographer }) {
  const [imageFailed, setImageFailed] = useState(false);
  const portfolioUrl = safePortfolioUrl(p.portfolioUrl);
  const experience = p.experienceYears && Object.hasOwn(EXPERIENCE_AR, p.experienceYears)
    ? EXPERIENCE_AR[p.experienceYears] : "غير مسجلة";

  return (
    <section aria-label="خبرة المصور وأعماله" className="grid gap-3 rounded-xl border border-border p-3 text-sm sm:grid-cols-2" data-testid={`info-photographer-profile-${p.id}`}>
      <div className="space-y-2">
        <p className="font-semibold">الصورة الشخصية</p>
        {p.profileImagePath && !imageFailed ? (
          <img src={`${API}/storage${p.profileImagePath}`} alt={`الصورة الشخصية للمصور ${p.name}`}
            className="h-32 w-32 rounded-xl border border-border object-cover"
            onError={() => setImageFailed(true)} />
        ) : <p className="text-muted-foreground">{imageFailed ? "تعذر تحميل الصورة الشخصية" : "لم تُرفق صورة شخصية"}</p>}
      </div>
      <div className="space-y-3">
        <p>سنوات الخبرة: <span className="font-semibold">{experience}</span></p>
        <div className="space-y-1">
          <p className="font-semibold">معرض الأعمال</p>
          {portfolioUrl ? (
            <a href={portfolioUrl} target="_blank" rel="noopener noreferrer"
              className="inline-block max-w-full break-all text-primary underline underline-offset-4"
              data-testid={`link-photographer-portfolio-${p.id}`}>عرض أعمال المصور (يفتح في نافذة جديدة)</a>
          ) : <p className="text-muted-foreground">{p.portfolioUrl?.trim() ? "رابط معرض الأعمال غير صالح" : "لم يُضف رابط معرض أعمال"}</p>}
        </div>
      </div>
    </section>
  );
}
