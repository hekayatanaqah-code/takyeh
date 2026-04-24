import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { MapPin, Menu, Home, LogIn, LayoutDashboard, Settings } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@workspace/replit-auth-web";
import { useQuery } from "@tanstack/react-query";
import { useStaffAuth } from "@/lib/useStaffAuth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function Navbar() {
  const [location, navigate] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const { isAuthenticated, isLoading } = useAuth();
  const { isStaff } = useStaffAuth();

  const { data: settings = {} } = useQuery<Record<string, string>>({
    queryKey: ["page-content"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/page-content`, { credentials: "include" });
      if (!r.ok) return {};
      return r.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  const siteTitle  = settings.site_display_name || settings.site_title || "تكية";
  const logoUrl    = settings.site_logo_url || "";
  const logoSize   = settings.logo_size === "lg" ? "w-16 h-16" : settings.logo_size === "sm" ? "w-9 h-9" : "w-12 h-12";

  const navLinks = [
    { href: "/", label: "الرئيسية", icon: <Home className="w-4 h-4 me-2" /> },
  ];

  const goToLogin = () => {
    setIsOpen(false);
    navigate("/login");
  };

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={siteTitle}
                className={`${logoSize} object-contain rounded-xl group-hover:scale-105 transition-transform duration-300`}
              />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20 group-hover:scale-105 transition-transform duration-300">
                <MapPin className="w-6 h-6" />
              </div>
            )}
            <span className="text-xl font-bold text-foreground tracking-tight">{siteTitle}</span>
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
                  {/* Admin panel button — visible to staff/admin only */}
                  {isStaff && (
                    <Link href="/admin">
                      <Button size="sm" variant="ghost" className="rounded-full w-9 h-9 p-0 text-muted-foreground hover:text-foreground" title="لوحة الإدارة">
                        <Settings className="w-4 h-4" />
                      </Button>
                    </Link>
                  )}
                </div>
              ) : (
                <Button
                  size="sm"
                  onClick={goToLogin}
                  className="ms-2 rounded-full font-semibold"
                >
                  <LogIn className="w-4 h-4 me-1.5" />
                  تسجيل الدخول
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
                        onClick={goToLogin}
                        className="flex items-center px-4 py-3 rounded-xl text-base font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                      >
                        <LogIn className="w-4 h-4 me-2" />
                        تسجيل الدخول
                      </button>
                    )
                  )}
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
    </>
  );
}
