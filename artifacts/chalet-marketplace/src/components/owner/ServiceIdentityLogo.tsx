import { useState } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function ServiceIdentityLogo({ logoUrl, name }: { logoUrl: string | null; name: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const uploadedUrl = logoUrl?.trim() || "";
  const src = uploadedUrl.startsWith("/") && !uploadedUrl.startsWith("//") && BASE && !uploadedUrl.startsWith(`${BASE}/`)
    ? `${BASE}${uploadedUrl}`
    : uploadedUrl;
  const failed = !!src && failedUrl === src;

  return (
    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-background p-1.5" data-testid="service-identity-logo">
      {src && !failed ? (
        <img
          src={src}
          alt={`شعار ${name}`}
          className="h-full w-full object-contain"
          onError={() => setFailedUrl(src)}
        />
      ) : (
        <span className="text-center text-xs leading-relaxed text-muted-foreground">
          {failed ? "تعذّر تحميل الشعار" : "لم يُرفع شعار"}
        </span>
      )}
    </div>
  );
}