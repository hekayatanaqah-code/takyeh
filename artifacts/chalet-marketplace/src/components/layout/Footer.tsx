import { Link, useLocation } from "wouter";
import { MapPin, Mail, Instagram, Twitter, Building2, LogIn } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toHijriComponents } from "@/lib/hijri";
import { saudiWhatsappPhone } from "@/lib/saudiPhone";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function SnapchatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.065 2c2.593 0 4.956 1.553 5.86 3.857.297.762.36 1.616.36 2.424 0 .355-.02.71-.046 1.063.094.05.204.075.32.075.32 0 .68-.153 1.018-.418.16-.125.337-.19.512-.19.31 0 .598.186.734.478.155.332.058.71-.232.944-.035.028-.68.544-1.737.762-.25.795-.665 1.47-1.187 2.007.633.28 1.403.423 2.296.423.25 0 .497-.016.74-.047.34-.047.653.16.74.494.086.335-.1.672-.43.79-.063.022-1.57.548-2.054 2.157-.048.16-.183.27-.355.27-.08 0-.16-.022-.23-.063-.34-.194-.72-.293-1.11-.293-.29 0-.575.05-.846.148-.614.226-1.16.62-1.683 1.005-.82.6-1.665 1.218-2.777 1.218-1.106 0-1.952-.618-2.773-1.218-.523-.385-1.07-.78-1.683-1.005-.27-.098-.555-.148-.846-.148-.39 0-.77.1-1.11.293-.07.04-.15.063-.23.063-.172 0-.307-.11-.355-.27-.484-1.61-1.99-2.135-2.054-2.157-.33-.118-.516-.455-.43-.79.087-.334.4-.54.74-.494.243.03.49.047.74.047.893 0 1.663-.144 2.296-.423-.522-.537-.937-1.212-1.187-2.007-1.057-.218-1.702-.734-1.737-.762-.29-.234-.387-.612-.232-.944.136-.292.424-.478.734-.478.175 0 .352.065.512.19.337.265.698.418 1.018.418.116 0 .226-.025.32-.075A13.3 13.3 0 0 1 5.775 8.28c0-.808.063-1.662.36-2.424C7.039 3.553 9.402 2 11.995 2h.07Z"/>
    </svg>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.53V6.77a4.85 4.85 0 0 1-1.01-.08z"/>
    </svg>
  );
}

export function Footer() {
  const [location] = useLocation();
  const isHomepage = location === "/";
  const { data: settings = {} } = useQuery<Record<string, string>>({
    queryKey: ["page-content"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/page-content`, { credentials: "include" });
      if (!r.ok) return {};
      return r.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  const logoUrl     = settings.site_logo_url ?? "";
  const whatsappRaw = settings.platform_whatsapp ?? "";
  const whatsappMsg = settings.whatsapp_message ?? "مرحباً، أود الاستفسار عن خدمات منصة تكيّة";
  const whatsappNum = saudiWhatsappPhone(whatsappRaw);
  const waLink      = whatsappNum ? `https://wa.me/${whatsappNum}?text=${encodeURIComponent(whatsappMsg)}` : undefined;
  const displayPhone = whatsappRaw || "رقم واتساب غير محدد";

  const email        = settings.platform_email    ?? "info@qassim-chalets.com";
  const instagramUrl = settings.instagram_url     ?? "#";
  const twitterUrl   = settings.twitter_url       ?? "#";
  const snapchatUrl  = settings.snapchat_url      ?? "#";
  const tiktokUrl    = settings.tiktok_url        ?? "#";

  const showInstagram = settings.instagram_show !== "0";
  const showTwitter   = settings.twitter_show   !== "0";
  const showSnapchat  = settings.snapchat_show  === "1";
  const showTikTok    = settings.tiktok_show    === "1";

  const hasSocial = showInstagram || showTwitter || showSnapchat || showTikTok;

  return (
    <footer className={`bg-foreground text-background ${isHomepage ? "pt-12" : "pt-8"} pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-12 mt-auto`}>
      <div className="container mx-auto px-4">
        <div className={`grid grid-cols-1 items-start gap-8 md:gap-12 ${isHomepage ? "md:grid-cols-3" : "mx-auto max-w-4xl md:grid-cols-2"}`}>

          {/* Brand */}
          {isHomepage && <div className="space-y-4">
            <div className="flex items-center gap-2">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={settings.site_display_name || settings.site_title || "تكية"}
                  className="w-12 h-12 object-contain brightness-0 invert opacity-100 drop-shadow-sm"
                />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
                  <MapPin className="w-5 h-5" />
                </div>
              )}
              <span className="text-xl font-bold">{settings.footer_title || settings.site_title || "شاليهات القصيم"}</span>
            </div>
            <p className="text-background/70 text-sm leading-relaxed max-w-xs">
              {settings.footer_desc || "المنصة الأولى لحجز الشاليهات والاستراحات الفاخرة في منطقة القصيم. اكتشف أجمل الأماكن لقضاء أوقات لا تُنسى."}
            </p>
          </div>}

          {/* Navigation Links */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b border-background/20 pb-2 block">روابط مفيدة</h3>
            <ul className="flex flex-col gap-3">
              {[
                { href: "/about",   label: "من نحن" },
                { href: "/faq",     label: "أسئلة شائعة" },
                { href: "/terms",   label: "شروط الاستخدام" },
                { href: "/privacy", label: "سياسة الخصوصية" },
                { href: "/contact", label: "اتصل بنا" },
              ].map(({ href, label }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="flex items-center gap-2 text-background/70 hover:text-primary transition-colors text-sm group"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-background/30 group-hover:bg-primary transition-colors flex-shrink-0" />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div id="footer-contact" className="space-y-4">
            <h3 className="text-lg font-semibold border-b border-background/20 pb-2 block">تواصل معنا</h3>
            <ul className="space-y-3">
              <li>
                <a href={waLink} aria-disabled={!waLink} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}
                  className="flex items-center gap-3 text-background/70 hover:text-[#25D366] transition-colors text-sm">
                  <svg role="img" aria-label="واتساب" focusable="false" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-[#25D366] flex-shrink-0">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                  </svg>
                  <span dir="ltr">{displayPhone}</span>
                </a>
              </li>
              <li>
                <a href={`mailto:${email}`}
                  className="flex items-center gap-3 text-background/70 hover:text-primary transition-colors text-sm">
                  <Mail className="w-4 h-4 text-primary" />
                  <span>{email}</span>
                </a>
              </li>
            </ul>

            {/* Social icons — only show enabled platforms */}
            {hasSocial && (
              <div className="flex items-center gap-3 mt-6 flex-wrap">
                {showInstagram && (
                  <a href={instagramUrl} target="_blank" rel="noreferrer"
                    className="w-10 h-10 rounded-full bg-background/10 flex items-center justify-center hover:bg-pink-500/80 transition-colors" title="إنستقرام">
                    <Instagram className="w-5 h-5" />
                  </a>
                )}
                {showTwitter && (
                  <a href={twitterUrl} target="_blank" rel="noreferrer"
                    className="w-10 h-10 rounded-full bg-background/10 flex items-center justify-center hover:bg-sky-500/80 transition-colors" title="تويتر / X">
                    <Twitter className="w-5 h-5" />
                  </a>
                )}
                {showSnapchat && (
                  <a href={snapchatUrl} target="_blank" rel="noreferrer"
                    className="w-10 h-10 rounded-full bg-background/10 flex items-center justify-center hover:bg-yellow-400/80 transition-colors" title="سناب شات">
                    <SnapchatIcon className="w-5 h-5" />
                  </a>
                )}
                {showTikTok && (
                  <a href={tiktokUrl} target="_blank" rel="noreferrer"
                    className="w-10 h-10 rounded-full bg-background/10 flex items-center justify-center hover:bg-slate-600 transition-colors" title="تيك توك">
                    <TikTokIcon className="w-5 h-5" />
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Dedicated owner and provider portal */}
        {isHomepage && <div className="mt-10 rounded-2xl border border-primary/40 bg-background/10 px-5 py-6 sm:px-8">
          <div className="flex flex-col gap-5 text-center sm:flex-row sm:items-center sm:justify-between sm:text-right">
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                <Building2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-background">بوابة الشركاء</h3>
                <p className="mt-1 text-sm leading-relaxed text-background/65">
                  بوابة الشركاء - دخول أصحاب الوجهات ومزودي الخدمات لإدارة الحجوزات والخدمات
                </p>
              </div>
            </div>
            <Link
              href="/login"
              className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-7 py-3 font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-xl"
              data-testid="link-partner-login"
            >
              <LogIn className="h-5 w-5" />
              دخول الشركاء
            </Link>
          </div>
        </div>}

        <div className={`border-t border-background/20 ${isHomepage ? "mt-12" : "mt-8"} pt-6 px-2 text-center text-sm leading-7 text-background/50`}>
          {(() => {
            const now = new Date();
            const hijriYear = toHijriComponents(now).year.toLocaleString("ar-SA");
            const gregYear  = now.getFullYear().toLocaleString("ar-SA");
            const siteName  = settings.footer_title || settings.site_title || "تكيّة";
            return (
              <p>© {hijriYear} هـ - {gregYear} م {siteName}. {settings.copyright_text || "جميع الحقوق محفوظة."}</p>
            );
          })()}
        </div>
      </div>
    </footer>
  );
}
