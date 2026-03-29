import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { MapPin, Menu, Home, Compass, LogIn, LayoutDashboard, Settings, X } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@workspace/replit-auth-web";

export function Navbar() {
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [authNoticeOpen, setAuthNoticeOpen] = useState(false);
  const { isAuthenticated, login, isLoading } = useAuth();

  const navLinks = [
    { href: "/", label: "الرئيسية", icon: <Home className="w-4 h-4 me-2" /> },
    { href: "/chalets", label: "الشاليهات", icon: <Compass className="w-4 h-4 me-2" /> },
    { href: "/services", label: "خدمات المناسبات", icon: <span className="me-2 text-base">🎪</span> },
  ];

  const handleLoginClick = () => {
    setAuthNoticeOpen(true);
  };

  const proceedToLogin = () => {
    setAuthNoticeOpen(false);
    setIsOpen(false);
    login("/dashboard");
  };

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20 group-hover:scale-105 transition-transform duration-300">
              <MapPin className="w-6 h-6" />
            </div>
            <span className="text-xl font-bold text-foreground tracking-tight">شاليهات القصيم</span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const isActive = location === link.href;
              return (
                <Link key={link.href} href={link.href} className="relative px-4 py-2 rounded-full text-sm font-medium transition-colors hover:text-primary">
                  <span className="flex items-center z-10 relative">
                    {link.icon}
                    {link.label}
                  </span>
                  {isActive && (
                    <motion.div
                      layoutId="navbar-indicator"
                      className="absolute inset-0 bg-primary/10 rounded-full"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                </Link>
              );
            })}

            {!isLoading && (
              isAuthenticated ? (
                <div className="flex items-center gap-1 ms-2">
                  <Link href="/dashboard">
                    <Button size="sm" className="rounded-full font-semibold shadow-sm shadow-primary/20">
                      <LayoutDashboard className="w-4 h-4 me-1.5" />
                      لوحة التحكم
                    </Button>
                  </Link>
                  <Link href="/admin">
                    <Button size="sm" variant="ghost" className="rounded-full w-9 h-9 p-0 text-muted-foreground hover:text-foreground" title="لوحة الإدارة">
                      <Settings className="w-4 h-4" />
                    </Button>
                  </Link>
                </div>
              ) : (
                <Button
                  size="sm"
                  onClick={handleLoginClick}
                  className="ms-2 rounded-full font-semibold"
                >
                  <LogIn className="w-4 h-4 me-1.5" />
                  تسجيل الدخول / إنشاء حساب
                </Button>
              )
            )}
          </nav>

          {/* Mobile Nav */}
          <div className="md:hidden">
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="hover-elevate">
                  <Menu className="w-6 h-6" />
                  <span className="sr-only">فتح القائمة</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[80vw] sm:w-[350px]">
                <SheetTitle className="text-right mt-4 mb-6 text-xl font-bold">القائمة الرئيسية</SheetTitle>
                <nav className="flex flex-col gap-4">
                  {navLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setIsOpen(false)}
                      className={`flex items-center px-4 py-3 rounded-xl text-base font-medium transition-colors ${
                        location === link.href ? "bg-primary/10 text-primary" : "hover:bg-secondary text-foreground"
                      }`}
                    >
                      {link.icon}
                      {link.label}
                    </Link>
                  ))}

                  {!isLoading && (
                    isAuthenticated ? (
                      <Link
                        href="/dashboard"
                        onClick={() => setIsOpen(false)}
                        className={`flex items-center px-4 py-3 rounded-xl text-base font-semibold transition-colors ${
                          location === "/dashboard"
                            ? "bg-primary text-primary-foreground"
                            : "bg-primary/10 text-primary hover:bg-primary/20"
                        }`}
                      >
                        <LayoutDashboard className="w-4 h-4 me-2" />
                        لوحة التحكم
                      </Link>
                    ) : (
                      <button
                        onClick={handleLoginClick}
                        className="flex items-center px-4 py-3 rounded-xl text-base font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                      >
                        <LogIn className="w-4 h-4 me-2" />
                        تسجيل الدخول / إنشاء حساب
                      </button>
                    )
                  )}
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {/* Auth Notice Dialog */}
      <Dialog open={authNoticeOpen} onOpenChange={setAuthNoticeOpen}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-right text-lg font-bold">تسجيل الدخول للملاك</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 dark:bg-amber-900/20 dark:border-amber-700">
              <p className="text-sm text-amber-800 dark:text-amber-200 leading-relaxed font-medium">
                التسجيل مخصص لملاك الشاليهات فقط.
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1 leading-relaxed">
                يمكن للمستأجرين البحث والحجز مباشرة دون الحاجة لإنشاء حساب.
              </p>
            </div>
            <div className="flex flex-col gap-2 pt-1">
              <Button onClick={proceedToLogin} className="w-full">
                <LogIn className="w-4 h-4 me-2" />
                متابعة كمالك شاليه
              </Button>
              <Button variant="outline" onClick={() => setAuthNoticeOpen(false)} className="w-full">
                إلغاء
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
