import { MessageCircle } from "lucide-react";

const WHATSAPP_NUMBER = import.meta.env.VITE_PLATFORM_WHATSAPP ?? "966500000000";

export function FloatingWhatsApp() {
  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("السلام عليكم، أود الاستفسار عن سوق الشاليهات")}`;

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      aria-label="تواصل معنا على واتساب"
      className="fixed bottom-6 left-6 z-50 flex items-center justify-center w-14 h-14 rounded-full bg-[#25D366] shadow-lg hover:bg-[#1fbd5a] hover:scale-110 active:scale-95 transition-all duration-200 group"
    >
      <MessageCircle className="w-7 h-7 text-white fill-white" />
      <span className="absolute right-full ml-0 mr-3 whitespace-nowrap bg-slate-800 text-white text-xs font-medium px-2.5 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        تواصل معنا
      </span>
    </a>
  );
}
