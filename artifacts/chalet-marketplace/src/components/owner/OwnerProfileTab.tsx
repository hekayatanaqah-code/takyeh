import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Calendar, CheckCircle, Lock, Loader2, Settings, Eye, EyeOff, Shield, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toAr } from "@/lib/utils";
import { contactDigits, contactPhoneInput, localContactPhone, profileContactErrors } from "@/lib/owner-profile-contact";
import { Button } from "@/components/ui/button";


/* ── Owner Account Settings Tab ────────────────────────────── */
export function OwnerProfileTab() {
  const { toast } = useToast();
  const profileQueryClient = useQueryClient();
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
  function apiFetch(path: string, opts?: RequestInit) {
    return fetch(`${BASE}/api${path}`, { credentials: "include", headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) }, ...opts });
  }

  /* ── form fields ── */
  const [fullName, setFullName] = useState("");
  const [phone, setPhone]       = useState("");
  const [email, setEmail]       = useState("");
  const [contactTouched, setContactTouched] = useState({ phone: false, email: false });
  const contactErrors = profileContactErrors(phone, email);

  /* ── baselines for dirty-detection ── */
  const [initName,  setInitName]  = useState("");
  const [initPhone, setInitPhone] = useState("");
  const [initEmail, setInitEmail] = useState("");

  /* ── password-change section ── */
  const [showPwSection, setShowPwSection]   = useState(false);
  const [currentPw, setCurrentPw]           = useState("");
  const [newPw, setNewPw]                   = useState("");
  const [confirmPw, setConfirmPw]           = useState("");
  const [showCurPw, setShowCurPw]           = useState(false);
  const [showNewPw, setShowNewPw]           = useState(false);
  const [showConPw, setShowConPw]           = useState(false);

  /* ── multi-step secure flow for email/phone changes ── */
  type SecureStep = "idle" | "password" | "otp";
  const [secureStep, setSecureStep]     = useState<SecureStep>("idle");
  const [securePw, setSecurePw]         = useState("");
  const [showSecPw, setShowSecPw]       = useState(false);
  const [secureOtp, setSecureOtp]       = useState("");
  const [otpSentTo, setOtpSentTo]       = useState("");
  const [sendingOtp, setSendingOtp]     = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  /* ── WhatsApp notification settings (unified) ── */
  const [waSubscribe,      setWaSubscribe]      = useState(false);
  const [waReviewEnabled,  setWaReviewEnabled]  = useState(false);
  const [waSupportEnabled, setWaSupportEnabled] = useState(false);
  const [waUnifiedPhone,   setWaUnifiedPhone]   = useState("");
  const [savingWa,         setSavingWa]         = useState(false);
  const [broadcastPreferences, setBroadcastPreferences] = useState({ inApp: false, inbox: false, email: false, whatsapp: false });
  const [savingBroadcastPreferences, setSavingBroadcastPreferences] = useState(false);
  const [broadcastPreferencesError, setBroadcastPreferencesError] = useState("");

  /* ── Calendar preferences (seeded from DB via localStorage on load) ── */
  const [bookingsCalPrefLocal, setBookingsCalPrefLocal] = useState<"hijri" | "gregorian">(
    (localStorage.getItem("dashCalDefaultType") as "hijri" | "gregorian") ?? "hijri"
  );
  const [reportsCalPrefLocal, setReportsCalPrefLocal] = useState<"gregorian" | "hijri">(
    (localStorage.getItem("revCalType") as "gregorian" | "hijri") ?? "gregorian"
  );
  const [salaryCalPrefLocal, setSalaryCalPrefLocal] = useState<"gregorian" | "hijri">(
    (localStorage.getItem("staffCalDefault") as "gregorian" | "hijri") ?? "gregorian"
  );

  /* ── page-level state ── */
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [savingCalendarPreference, setSavingCalendarPreference] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  async function saveCalendarPreference(key: "bookingsCalPref" | "reportsCalPref" | "salaryCalPref", value: "hijri" | "gregorian") {
    if (savingCalendarPreference) return;
    setSavingCalendarPreference(true);
    try {
      const response = await apiFetch("/owner/profile/calendar-prefs", {
        method: "PATCH",
        body: JSON.stringify({ [key]: value }),
      });
      if (!response.ok) throw new Error("calendar-preference-save-failed");
      if (key === "bookingsCalPref") {
        setBookingsCalPrefLocal(value);
        localStorage.setItem("dashCalDefaultType", value);
      } else if (key === "reportsCalPref") {
        setReportsCalPrefLocal(value);
        localStorage.setItem("revCalType", value);
      } else {
        setSalaryCalPrefLocal(value);
        localStorage.setItem("staffCalDefault", value);
        window.dispatchEvent(new CustomEvent("salaryCalPrefChanged", { detail: value }));
      }
      await profileQueryClient.invalidateQueries({ queryKey: ["owner", "profile-btype"] });
    } catch {
      toast({ title: "تعذّر حفظ تفضيل التقويم", description: "بقي اختيارك السابق محفوظاً. حاول مرة أخرى.", variant: "destructive" });
    } finally {
      setSavingCalendarPreference(false);
    }
  }

  useEffect(() => {
    setFetchError(null);
    Promise.all([
      apiFetch("/owner/profile").then(async (r) => {
        const d = await r.json().catch(() => null);
        if (!r.ok) { setFetchError(d?.error ?? "تعذّر تحميل بيانات الحساب"); return null; }
        if (d) {
          const n = d.fullName ?? "", ph = localContactPhone(d.phone ?? ""), em = d.email ?? "";
          setFullName(n); setInitName(n);
          setPhone(ph);   setInitPhone(ph);
          setEmail(em);   setInitEmail(em);
          if (d.bookingsCalPref === "hijri" || d.bookingsCalPref === "gregorian") setBookingsCalPrefLocal(d.bookingsCalPref);
          if (d.reportsCalPref === "hijri" || d.reportsCalPref === "gregorian") setReportsCalPrefLocal(d.reportsCalPref);
          if (d.salaryCalPref === "hijri" || d.salaryCalPref === "gregorian") setSalaryCalPrefLocal(d.salaryCalPref);
          setWaSubscribe(!!d.whatsappNewsSubscribe);
          return ph;
        }
        return null;
      }).catch(() => { setFetchError("تعذّر الاتصال بالخادم"); return null; }),
      apiFetch("/owner/notification-settings")
        .then(async (r) => r.ok ? r.json() : null)
        .catch(() => null),
      apiFetch("/owner/broadcast-preferences")
        .then(async (r) => {
          const data = await r.json().catch(() => null);
          if (!r.ok) throw new Error(data?.error ?? "تعذّر تحميل تفضيلات التعميمات");
          return data;
        })
        .catch((error) => {
          setBroadcastPreferencesError(error instanceof Error ? error.message : "تعذّر تحميل تفضيلات التعميمات");
          return null;
        }),
    ]).then(([mainPhone, nd, broadcastPrefs]) => {
      if (nd) {
        setWaReviewEnabled(nd.waEnabled ?? false);
        setWaSupportEnabled(nd.waSupportEnabled ?? false);
        const raw = nd.waPhone ?? "";
        const formatted = localContactPhone(raw);
        setWaUnifiedPhone(formatted || mainPhone || "");
      } else if (mainPhone) {
        setWaUnifiedPhone(mainPhone);
      }
      if (broadcastPrefs) {
        setBroadcastPreferences({
          inApp: !!broadcastPrefs.inApp,
          inbox: !!broadcastPrefs.inbox,
          email: !!broadcastPrefs.email,
          whatsapp: !!broadcastPrefs.whatsapp,
        });
      }
    }).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function normalizeWaPhone(raw: string): string | null {
    const digits = contactDigits(raw);
    if (!digits) return null;
    if (digits.startsWith("0")) return "966" + digits.slice(1);
    if (digits.startsWith("5") && digits.length === 9) return "966" + digits;
    return digits;
  }

  function toArabicDigits(val: string): string {
    return val.replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[parseInt(d)]);
  }

  async function saveWaSettings() {
    if (waUnifiedPhone && !/^\d{1,10}$/.test(waUnifiedPhone)) {
      toast({ title: "تحقّق من رقم الواتساب", description: "استخدم الأرقام فقط، بحد أقصى ١٠ أرقام.", variant: "destructive" });
      return;
    }
    setSavingWa(true);
    try {
      const responses = await Promise.all([
        apiFetch("/owner/notification-settings", {
          method: "PATCH",
          body: JSON.stringify({ waEnabled: waReviewEnabled, waSupportEnabled, waPhone: normalizeWaPhone(waUnifiedPhone) }),
        }),
        apiFetch("/owner/profile/whatsapp-subscribe", {
          method: "PATCH",
          body: JSON.stringify({ subscribe: waSubscribe }),
        }),
      ]);
      for (const response of responses) {
        if (!response.ok) throw new Error("تعذّر حفظ إعدادات الواتساب");
      }
      toast({ title: "تم الحفظ ✓", description: "تم تحديث إعدادات الإشعارات عبر الواتساب" });
    } catch {
      toast({ title: "خطأ", description: "تعذّر حفظ الإعدادات", variant: "destructive" });
    } finally { setSavingWa(false); }
  }

  async function saveBroadcastPreferences() {
    setSavingBroadcastPreferences(true);
    setBroadcastPreferencesError("");
    try {
      const response = await apiFetch("/owner/broadcast-preferences", {
        method: "PATCH",
        body: JSON.stringify(broadcastPreferences),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "تعذّر حفظ تفضيلات التعميمات");
      if (data) {
        setBroadcastPreferences({
          inApp: !!data.inApp,
          inbox: !!data.inbox,
          email: !!data.email,
          whatsapp: !!data.whatsapp,
        });
      }
      toast({ title: "تم الحفظ ✓", description: "تم تحديث تفضيلات استقبال التعميمات" });
    } catch (error) {
      setBroadcastPreferencesError(error instanceof Error ? error.message : "تعذّر حفظ تفضيلات التعميمات");
      toast({ title: "خطأ", description: "تعذّر حفظ تفضيلات التعميمات", variant: "destructive" });
    } finally {
      setSavingBroadcastPreferences(false);
    }
  }

  /* dirty-detection */
  const nameChanged  = fullName.trim() !== initName.trim();
  const phoneChanged = phone.trim()    !== initPhone.trim();
  const emailChanged = email.trim().toLowerCase() !== initEmail.trim().toLowerCase();
  const sensitiveChanged = phoneChanged || emailChanged;
  const pwEdited = showPwSection && (currentPw || newPw || confirmPw);
  const hasChanges = nameChanged || sensitiveChanged || pwEdited;

  /* ── Save (non-sensitive: name / password only) ── */
  function validateContacts() {
    setContactTouched({ phone: true, email: true });
    const error = contactErrors.phone || contactErrors.email;
    if (error) toast({ title: "تحقّق من بيانات التواصل", description: error, variant: "destructive" });
    return !error;
  }

  async function handleSave() {
    if (!fullName.trim()) { toast({ title: "الاسم مطلوب", variant: "destructive" }); return; }
    if (!validateContacts()) return;
    if (sensitiveChanged) { setSecureStep("password"); setSecurePw(""); setSecureOtp(""); return; }
    if (showPwSection) {
      if (!currentPw) { toast({ title: "كلمة المرور الحالية مطلوبة", variant: "destructive" }); return; }
      if (newPw.length < 6) { toast({ title: "كلمة المرور الجديدة يجب أن تكون ٦ أحرف على الأقل", variant: "destructive" }); return; }
      if (newPw !== confirmPw) { toast({ title: "كلمتا المرور غير متطابقتين", variant: "destructive" }); return; }
    }
    setSaving(true);
    try {
      const body: Record<string, string> = { fullName: fullName.trim() };
      if (showPwSection && currentPw && newPw) { body.currentPassword = currentPw; body.newPassword = newPw; }
      const r = await apiFetch("/owner/profile", { method: "PUT", body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) { toast({ title: "خطأ", description: d.error ?? "فشل الحفظ", variant: "destructive" }); return; }
      toast({ title: "تم الحفظ ✓", description: "تم تحديث بيانات حسابك بنجاح" });
      setInitName(fullName.trim());
      void profileQueryClient.invalidateQueries({ queryKey: ["owner", "profile-btype"] });
      setCurrentPw(""); setNewPw(""); setConfirmPw(""); setShowPwSection(false);
    } finally { setSaving(false); }
  }

  /* ── Step 1: verify password & send OTP ── */
  async function handleSendOtp() {
    if (!validateContacts()) return;
    if (!securePw) { toast({ title: "كلمة المرور مطلوبة", variant: "destructive" }); return; }
    setSendingOtp(true);
    try {
      const body: Record<string, string> = { currentPassword: securePw };
      if (emailChanged) body.newEmail = email.trim();
      else if (phoneChanged) body.newPhone = phone.trim();
      const r = await apiFetch("/owner/profile/request-change", { method: "POST", body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) { toast({ title: "خطأ", description: d.error ?? "فشل التحقق", variant: "destructive" }); return; }
      setOtpSentTo(d.otpSentTo ?? "");
      setSecureStep("otp");
      setSecureOtp("");
    } finally { setSendingOtp(false); }
  }

  /* ── Step 2: verify OTP & save all changes ── */
  async function handleVerifyAndSave() {
    if (!validateContacts()) return;
    if (secureOtp.length < 6) { toast({ title: "رمز التحقق يجب أن يكون ٦ أرقام", variant: "destructive" }); return; }
    setVerifyingOtp(true);
    try {
      const body: Record<string, string> = {
        fullName: fullName.trim(),
        phone:    phone.trim(),
        email:    email.trim().toLowerCase(),
        otp:      secureOtp.trim(),
        otpTarget: otpSentTo,
        sensitiveChange: "true",
      };
      const r = await apiFetch("/owner/profile", { method: "PUT", body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) { toast({ title: "خطأ", description: d.error ?? "رمز التحقق غير صحيح", variant: "destructive" }); return; }
      toast({ title: "تم الحفظ ✓", description: "تم تحديث بيانات حسابك بنجاح" });
      setInitName(fullName.trim());
      setInitPhone(phone.trim());
      setInitEmail(email.trim().toLowerCase());
      setSecureStep("idle");
      setSecurePw(""); setSecureOtp("");
    } finally { setVerifyingOtp(false); }
  }

  function cancelSecure() { setSecureStep("idle"); setSecurePw(""); setSecureOtp(""); }

  if (loading) return <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div dir="rtl" className="max-w-lg mx-auto space-y-5 py-4 text-right">
      {fetchError && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3 text-sm text-destructive font-medium text-right">
          {fetchError}
        </div>
      )}

      <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Settings className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">إعدادات الحساب</h2>
            <p className="text-sm leading-6 text-foreground/80">حدّث بيانات التواصل وكلمة المرور، واضبط الإشعارات والتقويم من هنا.</p>
          </div>
        </div>

        {/* ══════════ Normal editing form ══════════ */}
        {secureStep === "idle" && (
          <>
            {/* Full name */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">الاسم الكامل <span className="text-destructive">*</span></label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="text-right" placeholder="اسمك الكامل" />
            </div>

            {/* Phone */}
            <div className="space-y-1.5">
              <label htmlFor="owner-profile-phone" className="text-sm font-semibold flex items-center gap-1.5">
                رقم الجوال <span className="text-destructive" aria-hidden="true">*</span>
                {phoneChanged && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold">تم التغيير</span>}
              </label>
              <Input
                id="owner-profile-phone"
                value={toAr(phone)}
                onChange={(e) => setPhone(contactPhoneInput(e.target.value))}
                onBlur={() => setContactTouched((current) => ({ ...current, phone: true }))}
                className="text-right"
                placeholder="٠٥xxxxxxxx"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                required
                pattern="(05[0-9]{8}|٠٥[٠-٩]{8})"
                autoComplete="tel-national"
                dir="rtl"
                aria-invalid={contactTouched.phone && !!contactErrors.phone}
                aria-describedby="owner-profile-phone-help"
              />
              <p id="owner-profile-phone-help" className={`text-sm leading-6 ${contactTouched.phone && contactErrors.phone ? "text-destructive" : "text-foreground/80"}`}>
                {contactTouched.phone && contactErrors.phone ? contactErrors.phone : "مطلوب: رقم جوال من ١٠ أرقام يبدأ بـ ٠٥."}
              </p>
            </div>

            {/* Email — editable */}
            <div className="space-y-1.5">
              <label htmlFor="owner-profile-email" className="text-sm font-semibold flex items-center gap-1.5">
                البريد الإلكتروني <span className="text-destructive" aria-hidden="true">*</span>
                {emailChanged && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold">تم التغيير</span>}
              </label>
              <Input
                id="owner-profile-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setContactTouched((current) => ({ ...current, email: true }))}
                className="text-right"
                placeholder="example@email.com"
                type="email"
                dir="ltr"
                required
                autoComplete="email"
                aria-invalid={contactTouched.email && !!contactErrors.email}
                aria-describedby="owner-profile-email-help"
              />
              <p id="owner-profile-email-help" className={`text-sm leading-6 ${contactTouched.email && contactErrors.email ? "text-destructive" : "text-foreground/80"}`}>
                {contactTouched.email && contactErrors.email ? contactErrors.email : "مطلوب: بريدك الذي تستقبل عليه رسائل التحقق وتنبيهات الحساب."}
              </p>
              {sensitiveChanged && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <Shield className="w-3 h-3 shrink-0" />
                  لحماية حسابك، نطلب كلمة المرور ورمز تحقق عند تغيير الجوال أو البريد.
                </p>
              )}
            </div>

            {/* Password change toggle */}
            <button
              type="button"
              onClick={() => { setShowPwSection(v => !v); setCurrentPw(""); setNewPw(""); setConfirmPw(""); }}
              className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              <Lock className="w-4 h-4" />
              {showPwSection ? "إلغاء تغيير كلمة المرور" : "تغيير كلمة المرور"}
            </button>

            {showPwSection && (
              <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
                {/* Current password */}
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">كلمة المرور الحالية <span className="text-destructive">*</span></label>
                  <div className="relative">
                    <Input type={showCurPw ? "text" : "password"} value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} className="text-right pl-10" placeholder="••••••••" />
                    <button type="button" onClick={() => setShowCurPw(v => !v)} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
                      {showCurPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                {/* New password */}
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">كلمة المرور الجديدة</label>
                  <div className="relative">
                    <Input type={showNewPw ? "text" : "password"} value={newPw} onChange={(e) => setNewPw(e.target.value)} className="text-right pl-10" placeholder="٦ أحرف على الأقل" />
                    <button type="button" onClick={() => setShowNewPw(v => !v)} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
                      {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                {/* Confirm password */}
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">تأكيد كلمة المرور الجديدة</label>
                  <div className="relative">
                    <Input type={showConPw ? "text" : "password"} value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} className="text-right pl-10" placeholder="أعد كتابة كلمة المرور" />
                    <button type="button" onClick={() => setShowConPw(v => !v)} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
                      {showConPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <Button onClick={handleSave} disabled={saving || !hasChanges || !fullName.trim()} className="w-full gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              {sensitiveChanged ? "التحقق من الهوية وحفظ" : "حفظ التغييرات"}
            </Button>
          </>
        )}

        {/* ══════════ إعدادات الإشعارات عبر الواتساب ══════════ */}
        {secureStep === "idle" && (
          <div className="border-t border-border pt-5 space-y-4">
            {/* Header */}
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-green-500 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              <p className="text-sm font-bold text-foreground">إعدادات الإشعارات عبر الواتساب</p>
            </div>

            {/* Toggle 1: Review notifications */}
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <div className="relative mt-0.5 flex-shrink-0">
                <input type="checkbox" checked={waReviewEnabled} onChange={(e) => setWaReviewEnabled(e.target.checked)} className="sr-only" />
                <div className={`w-10 h-6 rounded-full transition-colors ${waReviewEnabled ? "bg-green-500" : "bg-muted-foreground/30"} relative`}>
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${waReviewEnabled ? "right-1" : "left-1"}`} />
                </div>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">إشعارات التقييمات <span className="text-xs font-normal text-muted-foreground">(من الزبائن)</span></p>
                <p className="text-sm text-foreground/80 mt-0.5 leading-6">يصلك تنبيه على واتساب عند إضافة تقييم جديد لعقارك.</p>
              </div>
            </label>

            {/* Toggle 2: News / platform subscribe */}
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <div className="relative mt-0.5 flex-shrink-0">
                <input type="checkbox" checked={waSubscribe} onChange={(e) => setWaSubscribe(e.target.checked)} className="sr-only" />
                <div className={`w-10 h-6 rounded-full transition-colors ${waSubscribe ? "bg-green-500" : "bg-muted-foreground/30"} relative`}>
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${waSubscribe ? "right-1" : "left-1"}`} />
                </div>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">أخبار تكيّة والتذكيرات <span className="text-xs font-normal text-muted-foreground">(من المنصة)</span></p>
                <p className="text-sm text-foreground/80 mt-0.5 leading-6">استقبل أخبار تكيّة وتذكيرات التجديد وعروض الاشتراك عبر واتساب.</p>
              </div>
            </label>

            {/* Toggle 3: Support notifications */}
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <div className="relative mt-0.5 flex-shrink-0">
                <input type="checkbox" checked={waSupportEnabled} onChange={(e) => setWaSupportEnabled(e.target.checked)} className="sr-only" />
                <div className={`w-10 h-6 rounded-full transition-colors ${waSupportEnabled ? "bg-green-500" : "bg-muted-foreground/30"} relative`}>
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${waSupportEnabled ? "right-1" : "left-1"}`} />
                </div>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">إشعارات الدعم الفني <span className="text-xs font-normal text-muted-foreground">(من المنصة)</span></p>
                <p className="text-sm text-foreground/80 mt-0.5 leading-6">يصلك تنبيه على واتساب عندما يرد فريق تكيّة على تذكرتك.</p>
              </div>
            </label>

            {/* Unified phone number */}
            <div className="space-y-1.5">
              <label htmlFor="owner-profile-whatsapp" className="text-sm font-semibold text-foreground">رقم الواتساب <span className="font-normal text-foreground/80">(اختياري)</span></label>
              <input
                id="owner-profile-whatsapp"
                type="tel"
                placeholder="٠٥xxxxxxxx"
                value={toArabicDigits(waUnifiedPhone)}
                onChange={(e) => setWaUnifiedPhone(contactPhoneInput(e.target.value))}
                inputMode="numeric"
                maxLength={10}
                pattern="[0-9٠-٩]{1,10}"
                autoComplete="tel-national"
                dir="rtl"
                className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm text-right focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <p className="mt-1 text-sm leading-6 text-foreground/80">رقم الواتساب اختياري؛ أدخل الأرقام فقط، بحد أقصى ١٠ أرقام.</p>
            </div>

            {/* Save button */}
            <div className="flex justify-end">
              <button
                onClick={saveWaSettings}
                disabled={savingWa}
                className="flex items-center gap-1.5 text-sm font-semibold bg-primary text-primary-foreground px-5 py-2 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {savingWa ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                حفظ الإعدادات
              </button>
            </div>
          </div>
        )}

        {/* ══════════ Broadcast preferences ══════════ */}
        {secureStep === "idle" && (
          <div className="border-t border-border pt-5 space-y-4">
            <div className="space-y-1">
              <p className="text-sm font-bold text-foreground">تفضيلات استقبال التعميمات</p>
              <p className="text-sm leading-6 text-foreground/80">اختر كيف تصلك أخبار المنصة وتعميماتها. يمكنك تشغيل كل قناة أو إيقافها بشكل مستقل.</p>
            </div>
            {broadcastPreferencesError && <p role="alert" className="text-xs text-destructive">{broadcastPreferencesError}</p>}
            <div className="grid gap-2 sm:grid-cols-2">
              {([
                ["inApp", "إشعارات داخل التطبيق"],
                ["inbox", "صندوق الوارد"],
                ["email", "البريد الإلكتروني"],
                ["whatsapp", "واتساب"],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={broadcastPreferences[key]}
                    onChange={(event) => setBroadcastPreferences((current) => ({ ...current, [key]: event.target.checked }))}
                    className="h-4 w-4 accent-primary"
                  />
                  {label}
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={saveBroadcastPreferences}
              disabled={savingBroadcastPreferences}
              className="flex items-center gap-1.5 text-sm font-semibold bg-primary text-primary-foreground px-5 py-2 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {savingBroadcastPreferences && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              حفظ تفضيلات التعميمات
            </button>
          </div>
        )}

        {/* ══════════ Calendar Preferences ══════════ */}
        {secureStep === "idle" && (
          <div dir="rtl" className="border-t border-border pt-5 space-y-4 text-right">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="w-4 h-4 text-primary" />
              <p className="text-sm font-bold text-foreground">تفضيلات التقويم</p>
            </div>
            <p className="text-sm leading-7 text-foreground/80">
              اختر التقويم الأساسي لكل قسم بشكل مستقل. تُحفظ اختياراتك لتُستخدم عند فتح الأقسام، ويمكنك تغييرها في أي وقت.
            </p>
            {/* Calendar default: Booking grid */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">التقويم الأساسي للحجوزات</label>
              <div dir="rtl" role="group" aria-label="التقويم الأساسي للحجوزات" className="grid grid-cols-2 w-full max-w-xs rounded-xl border border-border overflow-hidden text-sm">
                {(["hijri", "gregorian"] as const).map(v => (
                  <button
                    key={v}
                    type="button"
                    disabled={savingCalendarPreference}
                    onClick={() => void saveCalendarPreference("bookingsCalPref", v)}
                    aria-pressed={bookingsCalPrefLocal === v}
                    className={`min-h-11 px-5 py-2.5 text-center font-semibold transition-colors ${bookingsCalPrefLocal === v ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                  >{v === "hijri" ? "هجري" : "ميلادي"}</button>
                ))}
              </div>
              <p className="text-sm leading-6 text-foreground/80">يحدد التقويم الذي تبدأ به عند فتح تقويم الحجوزات.</p>
            </div>
            {/* Calendar default: Financial reports */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">التقويم الأساسي للتقارير المالية</label>
              <div dir="rtl" role="group" aria-label="التقويم الأساسي للتقارير المالية" className="grid grid-cols-2 w-full max-w-xs rounded-xl border border-border overflow-hidden text-sm">
                {(["hijri", "gregorian"] as const).map(v => (
                  <button
                    key={v}
                    type="button"
                    disabled={savingCalendarPreference}
                    onClick={() => void saveCalendarPreference("reportsCalPref", v)}
                    aria-pressed={reportsCalPrefLocal === v}
                    className={`min-h-11 px-5 py-2.5 text-center font-semibold transition-colors ${reportsCalPrefLocal === v ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                  >{v === "hijri" ? "هجري" : "ميلادي"}</button>
                ))}
              </div>
              <p className="text-sm leading-6 text-foreground/80">يحدد التقويم الذي تبدأ به عند فتح التقارير المالية.</p>
            </div>
            {/* Salary calendar preference */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">دورة احتساب الرواتب (مستقلة عن عرض التواريخ)</label>
              <div dir="rtl" role="group" aria-label="دورة احتساب الرواتب" className="grid grid-cols-2 w-full max-w-xs rounded-xl border border-border overflow-hidden text-sm">
                {(["hijri", "gregorian"] as const).map(v => (
                  <button
                    key={v}
                    type="button"
                    disabled={savingCalendarPreference}
                    onClick={() => void saveCalendarPreference("salaryCalPref", v)}
                    aria-pressed={salaryCalPrefLocal === v}
                    className={`min-h-11 px-5 py-2.5 text-center font-semibold transition-colors ${salaryCalPrefLocal === v ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                  >{v === "hijri" ? "هجري" : "ميلادي"}</button>
                ))}
              </div>
              <p className="text-sm leading-6 text-foreground/80">اختر التقويم المستخدم لحساب دورة الرواتب؛ لا يغيّر طريقة عرض تواريخ الحجوزات والتقارير.</p>
            </div>
          </div>
        )}

        {/* ══════════ Step 1: Password verification ══════════ */}
        {secureStep === "password" && (
          <div className="space-y-5">
            <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-xl p-4">
              <Shield className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
                <p className="font-semibold mb-1">التحقق من الهوية مطلوب</p>
                <p>لحماية حسابك، أدخل كلمة المرور الحالية لتأكيد هويتك قبل تغيير {emailChanged ? "البريد الإلكتروني" : "رقم الجوال"}.</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold">كلمة المرور الحالية <span className="text-destructive">*</span></label>
              <div className="relative">
                <Input
                  type={showSecPw ? "text" : "password"}
                  value={securePw}
                  onChange={(e) => setSecurePw(e.target.value)}
                  className="text-right pl-10"
                  placeholder="••••••••"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") handleSendOtp(); }}
                />
                <button type="button" onClick={() => setShowSecPw(v => !v)} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
                  {showSecPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={cancelSecure} disabled={sendingOtp}>إلغاء</Button>
              <Button className="flex-1 gap-2" onClick={handleSendOtp} disabled={sendingOtp || !securePw}>
                {sendingOtp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                التحقق وإرسال الرمز
              </Button>
            </div>
          </div>
        )}

        {/* ══════════ Step 2: OTP verification ══════════ */}
        {secureStep === "otp" && (
          <div className="space-y-5">
            <div className="flex items-start gap-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800/40 rounded-xl p-4">
              <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
              <div className="text-sm leading-relaxed">
                <p className="font-semibold text-green-800 dark:text-green-300 mb-1">تم إرسال رمز التحقق</p>
                <p className="text-green-700 dark:text-green-400">
                  تم إرسال الرمز إلى: <span className="font-bold text-foreground" dir="ltr">{otpSentTo}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">الرمز صالح لمدة ١٠ دقائق</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold">رمز التحقق <span className="text-destructive">*</span></label>
              <Input
                value={secureOtp}
                onChange={(e) => setSecureOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="text-center tracking-[0.5em] text-xl font-bold"
                placeholder="000000"
                inputMode="numeric"
                maxLength={6}
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter" && secureOtp.length === 6) handleVerifyAndSave(); }}
              />
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={cancelSecure} disabled={verifyingOtp}>إلغاء</Button>
              <Button className="flex-1 gap-2" onClick={handleVerifyAndSave} disabled={verifyingOtp || secureOtp.length < 6}>
                {verifyingOtp ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                تأكيد وحفظ التغييرات
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
