import { Button } from "@/components/ui/button";

interface WhatsAppButtonProps {
  phoneNumber: string;
  message?: string;
  className?: string;
  fullWidth?: boolean;
}

export function WhatsAppButton({ phoneNumber, message = "أهلاً، أود الاستفسار", className = "", fullWidth = false }: WhatsAppButtonProps) {
  
  // Format phone number to start with country code if needed, assuming KSA numbers
  const formattedNumber = phoneNumber.startsWith('+') 
    ? phoneNumber.replace('+', '') 
    : phoneNumber.startsWith('0') 
      ? `966${phoneNumber.substring(1)}` 
      : `966${phoneNumber}`;

  const whatsappUrl = `https://wa.me/${formattedNumber}?text=${encodeURIComponent(message)}`;

  return (
    <Button 
      className={`bg-[#25D366] hover:bg-[#1DA851] text-white shadow-lg shadow-[#25D366]/20 border-none transition-all duration-300 hover:scale-[1.02] active:scale-95 ${fullWidth ? 'w-full' : ''} ${className}`}
      onClick={() => window.open(whatsappUrl, '_blank')}
      size="lg"
    >
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        width="24" 
        height="24" 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        className="me-2"
      >
        <path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" />
        <path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1" />
      </svg>
      تواصل للحجز عبر واتساب
    </Button>
  );
}
