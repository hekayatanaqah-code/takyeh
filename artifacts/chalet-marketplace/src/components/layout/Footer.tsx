import { Link } from "wouter";
import { MapPin, Phone, Mail, Instagram, Twitter } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-foreground text-background py-12 mt-auto">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
          
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

          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b border-background/20 pb-2 inline-block">روابط سريعة</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/" className="text-background/70 hover:text-primary transition-colors inline-block text-sm">الرئيسية</Link>
              </li>
              <li>
                <Link href="/chalets" className="text-background/70 hover:text-primary transition-colors inline-block text-sm">جميع الشاليهات</Link>
              </li>
              <li>
                <Link href="/chalets?location=بريدة" className="text-background/70 hover:text-primary transition-colors inline-block text-sm">شاليهات بريدة</Link>
              </li>
              <li>
                <Link href="/chalets?location=عنيزة" className="text-background/70 hover:text-primary transition-colors inline-block text-sm">شاليهات عنيزة</Link>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
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
