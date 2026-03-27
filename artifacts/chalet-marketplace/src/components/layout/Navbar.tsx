import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { MapPin, Menu, Home, Compass } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { useState } from "react";
import { motion } from "framer-motion";

export function Navbar() {
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);

  const navLinks = [
    { href: "/", label: "الرئيسية", icon: <Home className="w-4 h-4 me-2" /> },
    { href: "/chalets", label: "الشاليهات المتاحة", icon: <Compass className="w-4 h-4 me-2" /> },
  ];

  return (
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
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
