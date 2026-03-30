import { Link } from "wouter";
import { MapPin, Phone, Mail, Instagram, Twitter } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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
  const whatsappNum = whatsappRaw.replace(/\D/g, "");
  const whatsappMsg = settings.whatsapp_message ?? "مرحباً، أود الاستفسار عن شاليهات القصيم";
  const waLink = whatsappNum
    ? `https://wa.me/${whatsappNum}?text=${encodeURIComponent(whatsappMsg)}`
    : "#";
  const displayPhone = whatsappRaw || "+966 50 000 0000";

  const email = settings.platform_email ?? "info@qassim-chalets.com";
  const instagramUrl = settings.instagram_url ?? "#";
  const twitterUrl = settings.twitter_url ?? "#";

  const scrollToContact = (e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById("footer-contact");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

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
              <span className="text-xl font-bold">شاليهات القصيم</span>
            </div>
            <p className="text-background/70 text-sm leading-relaxed max-w-xs">
              المنصة الأولى لحجز الشاليهات والاستراحات الفاخرة في منطقة القصيم. اكتشف أجمل الأماكن لقضاء أوقات لا تُنسى.
            </p>
          </div>

          {/* Navigation Links */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b border-background/20 pb-2 inline-block">روابط مفيدة</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/about" className="text-background/70 hover:text-primary transition-colors inline-block text-sm">
                  من نحن
                </Link>
              </li>
              <li>
                <Link href="/faq" className="text-background/70 hover:text-primary transition-colors inline-block text-sm">
                  أسئلة شائعة
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-background/70 hover:text-primary transition-colors inline-block text-sm">
                  شروط الاستخدام
                </Link>
              </li>
              <li>
                <a
                  href="#footer-contact"
                  onClick={scrollToContact}
                  className="text-background/70 hover:text-primary transition-colors inline-block text-sm cursor-pointer"
                >
                  تواصل معنا
                </a>
              </li>
            </ul>
          </div>

          {/* Contact — pulled from admin settings */}
          <div id="footer-contact" className="space-y-4">
            <h3 className="text-lg font-semibold border-b border-background/20 pb-2 inline-block">تواصل معنا</h3>
            <ul className="space-y-3">
              {/* WhatsApp number — opens wa.me with custom message */}
              <li>
                <a
                  href={waLink}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 text-background/70 hover:text-[#25D366] transition-colors text-sm group"
                >
                  <Phone className="w-4 h-4 text-[#25D366] group-hover:text-[#25D366]" />
                  <span dir="ltr">{displayPhone}</span>
                </a>
              </li>
              {/* Email */}
              <li>
                <a
                  href={`mailto:${email}`}
                  className="flex items-center gap-3 text-background/70 hover:text-primary transition-colors text-sm"
                >
                  <Mail className="w-4 h-4 text-primary" />
                  <span>{email}</span>
                </a>
              </li>
            </ul>

            {/* Social links */}
            <div className="flex items-center gap-4 mt-6">
              <a
                href={instagramUrl}
                target="_blank"
                rel="noreferrer"
                className="w-10 h-10 rounded-full bg-background/10 flex items-center justify-center hover:bg-primary transition-colors"
              >
                <Instagram className="w-5 h-5" />
              </a>
              <a
                href={twitterUrl}
                target="_blank"
                rel="noreferrer"
                className="w-10 h-10 rounded-full bg-background/10 flex items-center justify-center hover:bg-primary transition-colors"
              >
                <Twitter className="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>

        <div className="border-t border-background/20 mt-12 pt-6 text-center text-sm text-background/50">
          <p>© {new Date().getFullYear()} شاليهات القصيم. جميع الحقوق محفوظة.</p>
        </div>
      </div>
    </footer>
  );
}
