import { useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Mail, Phone, CheckCircle2, Loader2 } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function ContactUs() {
  const [name, setName]       = useState("");
  const [phone, setPhone]     = useState("");
  const [email, setEmail]     = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError]     = useState("");

  function normalizePhone(val: string) {
    return val.replace(/[٠١٢٣٤٥٦٧٨٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim() || !message.trim()) {
      setError("الاسم والرسالة مطلوبان");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: name.trim(), phone: normalizePhone(phone.trim()), email: email.trim(), message: message.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "حدث خطأ، يرجى المحاولة مرة أخرى");
      } else {
        setSuccess(true);
      }
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background" dir="rtl">
      <Navbar />
      <main className="flex-1 py-12 px-4">
        <div className="container mx-auto max-w-xl">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Mail className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-3xl font-extrabold text-foreground">اتصل بنا</h1>
          </div>

          {success ? (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-2xl p-10 text-center space-y-4">
              <CheckCircle2 className="w-14 h-14 text-green-500 mx-auto" />
              <h2 className="text-xl font-bold text-green-700 dark:text-green-400">تم إرسال رسالتك بنجاح!</h2>
              <p className="text-muted-foreground text-sm">سنتواصل معك في أقرب وقت ممكن. شكراً لتواصلك معنا.</p>
              <Button variant="outline" onClick={() => { setSuccess(false); setName(""); setPhone(""); setEmail(""); setMessage(""); }}>
                إرسال رسالة أخرى
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl p-8 space-y-5 shadow-sm">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">الاسم <span className="text-destructive">*</span></label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="اسمك الكريم"
                  dir="rtl"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5" />
                  رقم الجوال (اختياري)
                </label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="05XXXXXXXX"
                  dir="rtl"
                  inputMode="tel"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" />
                  البريد الإلكتروني (اختياري)
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@email.com"
                  dir="ltr"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">رسالتك <span className="text-destructive">*</span></label>
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="اكتب استفسارك أو ملاحظتك هنا..."
                  rows={5}
                  dir="rtl"
                  required
                />
              </div>

              {error && (
                <p className="text-sm text-destructive font-medium">{error}</p>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <><Loader2 className="w-4 h-4 me-2 animate-spin" />جاري الإرسال...</> : "إرسال الرسالة"}
              </Button>
            </form>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
