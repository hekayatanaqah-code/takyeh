import { Link } from "wouter";
import { MapPin, Phone, Mail, Instagram, Twitter } from "lucide-react";

export function Footer() {
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

          {/* Contact */}
          <div id="footer-contact" className="space-y-4">
            <h3 className="text-lg font-semibold border-b border-background/20 pb-2 inline-block">تواصل معنا</h3>
            <ul className="space-y-3">
              <li className="flex items-center gap-3 text-background/70 text-sm">
                <Phone className="w-4 h-4 text-primary" />
                <span dir="ltr">+966 50 000 0000</span>
              </li>
              <li className="flex items-center gap-3 text-background/70 text-sm">
                <Mail className="w-4 h-4 text-primary" />
                <span>info@qassim-chalets.com</span>
              </li>
            </ul>
            <div className="flex items-center gap-4 mt-6">
              <a href="#" className="w-10 h-10 rounded-full bg-background/10 flex items-center justify-center hover:bg-primary transition-colors">
                <Instagram className="w-5 h-5" />
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-background/10 flex items-center justify-center hover:bg-primary transition-colors">
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
