import { Link } from "wouter";
import { MapPin, Phone, Mail, Instagram, Twitter } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

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
  const { data: settings = {} } = useQuery<Record<string, string>>({
    queryKey: ["page-content"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/page-content`, { credentials: "include" });
      if (!r.ok) return {};
      return r.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  const whatsappRaw = settings.platform_whatsapp ?? "";
  const whatsappMsg = settings.whatsapp_message ?? "مرحباً، أود الاستفسار عن شاليهات القصيم";
  const whatsappNum = whatsappRaw.replace(/\D/g, "") || "966500000000";
  const waLink      = `https://wa.me/${whatsappNum}?text=${encodeURIComponent(whatsappMsg)}`;
  const displayPhone = whatsappRaw || "+966 50 000 0000";

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
    <footer className="bg-foreground text-background py-12 mt-auto">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">

          {/* Brand */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
                <MapPin className="w-5 h-5" />
              </div>
              <span className="text-xl font-bold">{settings.footer_title || settings.site_title || "شاليهات القصيم"}</span>
            </div>
            <p className="text-background/70 text-sm leading-relaxed max-w-xs">
              {settings.footer_desc || "المنصة الأولى لحجز الشاليهات والاستراحات الفاخرة في منطقة القصيم. اكتشف أجمل الأماكن لقضاء أوقات لا تُنسى."}
            </p>
          </div>

          {/* Navigation Links */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b border-background/20 pb-2 inline-block">روابط مفيدة</h3>
            <ul className="space-y-2">
              <li><Link href="/about" className="text-background/70 hover:text-primary transition-colors inline-block text-sm">من نحن</Link></li>
              <li><Link href="/faq" className="text-background/70 hover:text-primary transition-colors inline-block text-sm">أسئلة شائعة</Link></li>
              <li><Link href="/terms" className="text-background/70 hover:text-primary transition-colors inline-block text-sm">شروط الاستخدام</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div id="footer-contact" className="space-y-4">
            <h3 className="text-lg font-semibold border-b border-background/20 pb-2 inline-block">تواصل معنا</h3>
            <ul className="space-y-3">
              <li>
                <a href={waLink} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}
                  className="flex items-center gap-3 text-background/70 hover:text-[#25D366] transition-colors text-sm">
                  <Phone className="w-4 h-4 text-[#25D366] flex-shrink-0" />
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

        <div className="border-t border-background/20 mt-12 pt-6 text-center text-sm text-background/50">
          <p>© {new Date().getFullYear()} {settings.footer_title || settings.site_title || "شاليهات القصيم"}. {settings.copyright_text || "جميع الحقوق محفوظة."}</p>
        </div>
      </div>
    </footer>
  );
}
