import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCreateSubmission } from "@workspace/api-client-react";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle,
  Home,
  Phone,
  MapPin,
  Link as LinkIcon,
  FileText,
  DollarSign,
  Image,
  Plus,
  X,
  Building2,
} from "lucide-react";

const CITIES = [
  "بريدة",
  "عنيزة",
  "الرس",
  "الخبراء",
  "البكيرية",
  "عيون الجواء",
  "المذنب",
  "الأسياح",
];

export default function AddChalet() {
  const [submitted, setSubmitted] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<string[]>([""]);

  const [form, setForm] = useState({
    nameAr: "",
    whatsappNumber: "",
    location: "",
    websiteUrl: "",
    descriptionAr: "",
    pricePerNight: "",
  });

  const mutation = useCreateSubmission();

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const addPhotoField = () => {
    if (photoUrls.length < 5) {
      setPhotoUrls((prev) => [...prev, ""]);
    }
  };

  const removePhotoField = (idx: number) => {
    setPhotoUrls((prev) => prev.filter((_, i) => i !== idx));
  };

  const updatePhotoUrl = (idx: number, value: string) => {
    setPhotoUrls((prev) => prev.map((url, i) => (i === idx ? value : url)));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const photos = photoUrls.filter((url) => url.trim() !== "");

    mutation.mutate(
      {
        data: {
          nameAr: form.nameAr,
          whatsappNumber: form.whatsappNumber,
          location: form.location,
          websiteUrl: form.websiteUrl || undefined,
          descriptionAr: form.descriptionAr,
          pricePerNight: Number(form.pricePerNight),
          photos,
        },
      },
      {
        onSuccess: () => setSubmitted(true),
      }
    );
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Navbar />

      <AnimatePresence mode="wait">
        {submitted ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center min-h-[80vh] px-4 text-center"
          >
            <div className="w-24 h-24 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-6 mx-auto">
              <CheckCircle className="w-14 h-14 text-green-600 dark:text-green-400" />
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-4">
              تم الاستلام بنجاح!
            </h1>
            <p className="text-xl text-muted-foreground max-w-md leading-relaxed">
              تم استلام بياناتك بنجاح، سيتم مراجعة الشاليه ونشره قريباً
            </p>
            <p className="text-sm text-muted-foreground mt-4">
              سيتم التواصل معك عبر واتساب بعد المراجعة
            </p>
            <Button
              className="mt-8"
              onClick={() => {
                setSubmitted(false);
                setForm({
                  nameAr: "",
                  whatsappNumber: "",
                  location: "",
                  websiteUrl: "",
                  descriptionAr: "",
                  pricePerNight: "",
                });
                setPhotoUrls([""]);
              }}
            >
              إضافة شاليه آخر
            </Button>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="container mx-auto px-4 py-12 max-w-3xl"
          >
            {/* Header */}
            <div className="text-center mb-10">
              <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary/20">
                <Building2 className="w-9 h-9 text-primary-foreground" />
              </div>
              <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
                انضم إلينا كمالك
              </h1>
              <p className="text-muted-foreground text-lg max-w-md mx-auto leading-relaxed">
                أضف شاليهك وابدأ في استقبال الحجوزات من عملاء في منطقة القصيم
              </p>
            </div>

            {/* Form Card */}
            <div className="bg-card border border-border rounded-3xl p-6 md:p-10 shadow-sm">
              <form onSubmit={handleSubmit} className="space-y-8">
                {/* Section: Basic Info */}
                <div>
                  <h2 className="text-lg font-bold text-foreground mb-5 pb-3 border-b border-border flex items-center gap-2">
                    <Home className="w-5 h-5 text-primary" />
                    المعلومات الأساسية
                  </h2>
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="nameAr" className="text-base font-medium">
                        اسم الشاليه <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="nameAr"
                        placeholder="مثال: شاليه النخيل الذهبي"
                        value={form.nameAr}
                        onChange={(e) => handleChange("nameAr", e.target.value)}
                        required
                        className="h-12 text-base"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="location" className="text-base font-medium">
                        المدينة <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={form.location}
                        onValueChange={(val) => handleChange("location", val)}
                        required
                      >
                        <SelectTrigger className="h-12 text-base">
                          <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-muted-foreground" />
                            <SelectValue placeholder="اختر المدينة" />
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          {CITIES.map((city) => (
                            <SelectItem key={city} value={city}>
                              {city}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="descriptionAr" className="text-base font-medium">
                        وصف الشاليه <span className="text-destructive">*</span>
                      </Label>
                      <div className="relative">
                        <FileText className="absolute top-3 right-3 w-4 h-4 text-muted-foreground pointer-events-none" />
                        <Textarea
                          id="descriptionAr"
                          placeholder="صف شاليهك بالتفصيل: الموقع، المميزات، الخدمات المتاحة..."
                          value={form.descriptionAr}
                          onChange={(e) =>
                            handleChange("descriptionAr", e.target.value)
                          }
                          required
                          className="min-h-[120px] text-base pr-10 resize-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section: Contact & Pricing */}
                <div>
                  <h2 className="text-lg font-bold text-foreground mb-5 pb-3 border-b border-border flex items-center gap-2">
                    <Phone className="w-5 h-5 text-primary" />
                    التواصل والتسعير
                  </h2>
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="whatsappNumber" className="text-base font-medium">
                        رقم الواتساب <span className="text-destructive">*</span>
                      </Label>
                      <div className="relative">
                        <Phone className="absolute top-3.5 right-3 w-4 h-4 text-muted-foreground pointer-events-none" />
                        <Input
                          id="whatsappNumber"
                          type="tel"
                          placeholder="05XXXXXXXX"
                          value={form.whatsappNumber}
                          onChange={(e) =>
                            handleChange("whatsappNumber", e.target.value)
                          }
                          required
                          className="h-12 text-base pr-10"
                          dir="ltr"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div className="space-y-2">
                        <Label htmlFor="pricePerNight" className="text-base font-medium">
                          السعر لليلة (ر.س) <span className="text-destructive">*</span>
                        </Label>
                        <div className="relative">
                          <DollarSign className="absolute top-3.5 right-3 w-4 h-4 text-muted-foreground pointer-events-none" />
                          <Input
                            id="pricePerNight"
                            type="number"
                            min="1"
                            placeholder="500"
                            value={form.pricePerNight}
                            onChange={(e) =>
                              handleChange("pricePerNight", e.target.value)
                            }
                            required
                            className="h-12 text-base pr-10"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="websiteUrl" className="text-base font-medium">
                          رابط الموقع / الخريطة
                          <span className="text-muted-foreground text-sm mr-1">(اختياري)</span>
                        </Label>
                        <div className="relative">
                          <LinkIcon className="absolute top-3.5 right-3 w-4 h-4 text-muted-foreground pointer-events-none" />
                          <Input
                            id="websiteUrl"
                            type="url"
                            placeholder="https://maps.google.com/..."
                            value={form.websiteUrl}
                            onChange={(e) =>
                              handleChange("websiteUrl", e.target.value)
                            }
                            className="h-12 text-base pr-10"
                            dir="ltr"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section: Photos */}
                <div>
                  <h2 className="text-lg font-bold text-foreground mb-5 pb-3 border-b border-border flex items-center gap-2">
                    <Image className="w-5 h-5 text-primary" />
                    صور الشاليه
                    <span className="text-sm font-normal text-muted-foreground">
                      (حتى 5 صور)
                    </span>
                  </h2>
                  <div className="space-y-3">
                    {photoUrls.map((url, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-2"
                      >
                        <div className="relative flex-1">
                          <Image className="absolute top-3.5 right-3 w-4 h-4 text-muted-foreground pointer-events-none" />
                          <Input
                            type="url"
                            placeholder={`رابط الصورة ${idx + 1}`}
                            value={url}
                            onChange={(e) => updatePhotoUrl(idx, e.target.value)}
                            className="h-12 text-base pr-10"
                            dir="ltr"
                          />
                        </div>
                        {photoUrls.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removePhotoField(idx)}
                            className="text-muted-foreground hover:text-destructive shrink-0"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </motion.div>
                    ))}

                    {photoUrls.length < 5 && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={addPhotoField}
                        className="w-full h-12 border-dashed text-muted-foreground hover:text-foreground"
                      >
                        <Plus className="w-4 h-4 me-2" />
                        إضافة صورة أخرى
                      </Button>
                    )}
                  </div>
                </div>

                {/* Error message */}
                {mutation.isError && (
                  <div className="bg-destructive/10 text-destructive rounded-xl p-4 text-center">
                    حدث خطأ أثناء إرسال البيانات. يرجى المحاولة مرة أخرى.
                  </div>
                )}

                {/* Submit */}
                <Button
                  type="submit"
                  size="lg"
                  className="w-full h-14 text-lg font-bold rounded-2xl shadow-lg shadow-primary/20"
                  disabled={mutation.isPending}
                >
                  {mutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                      جاري الإرسال...
                    </span>
                  ) : (
                    "إرسال طلب التسجيل"
                  )}
                </Button>

                <p className="text-center text-sm text-muted-foreground">
                  بالضغط على إرسال، أنت توافق على مراجعة بياناتك من قِبل فريقنا
                </p>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
