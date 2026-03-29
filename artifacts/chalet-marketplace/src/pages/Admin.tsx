import { useState, useEffect } from "react";
import { formatDualDate } from "@/lib/hijri";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Trash2, CheckCircle, XCircle, MapPin, Settings, Users, Tag, Building2, Wrench, Plus, Edit2, Phone, Eye, Calendar } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE}/api`;

/* ── Domain types ─────────────────────────────── */
type ServiceCategory = "bounce_houses" | "ice_cream" | "productive_families";

interface Submission {
  id: number;
  nameAr: string;
  location: string;
  district?: string | null;
  whatsappNumber: string;
  pricePerNight: string;
  status: string;
  createdAt: string;
  trialEndsAt?: string | null;
  mapsUrl?: string | null;
  websiteUrl?: string | null;
  descriptionAr?: string | null;
  amenities?: string[];
  photos?: string[];
}

interface City {
  id: number;
  name: string;
  isActive: boolean;
}

interface District {
  id: number;
  name: string;
  cityId: number;
  isActive: boolean;
}

interface Amenity {
  id: number;
  key: string;
  labelAr: string;
  isActive: boolean;
}

interface Owner {
  ownerId: string;
  nameAr: string;
  whatsappNumber: string;
  createdAt: string;
}

interface Service {
  id: number;
  nameAr: string;
  category: ServiceCategory;
  descriptionAr: string;
  whatsappNumber: string;
  price: string | null;
  priceNote: string | null;
  city: string | null;
  isActive: boolean;
}

function apiFetch(path: string, opts?: RequestInit) {
  return fetch(`${API}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
    ...opts,
  });
}

/* ── Status Badge ─────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    pending:  { label: "قيد الانتظار", className: "bg-amber-100 text-amber-800 border-amber-200" },
    approved: { label: "مقبول",        className: "bg-green-100 text-green-800 border-green-200" },
    rejected: { label: "مرفوض",        className: "bg-red-100 text-red-800 border-red-200" },
  };
  const s = map[status] ?? { label: status, className: "" };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${s.className}`}>{s.label}</span>;
}

/* ── Submission Review Modal ──────────────────── */
function SubmissionReviewModal({
  submission,
  open,
  onClose,
  onApprove,
  onReject,
  isPending,
}: {
  submission: Submission | null;
  open: boolean;
  onClose: () => void;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  isPending: boolean;
}) {
  if (!submission) return null;
  const s = submission;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right text-xl font-bold">{s.nameAr}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-slate-400">المدينة:</span>
              <span className="mr-2 text-white">{s.location}</span>
              {s.district && <span className="text-slate-300"> ← {s.district}</span>}
            </div>
            <div>
              <span className="text-slate-400">السعر:</span>
              <span className="mr-2 text-white">{Number(s.pricePerNight).toLocaleString("ar-SA")} ر.س / ليلة</span>
            </div>
            <div>
              <span className="text-slate-400">واتساب:</span>
              <span className="mr-2 text-white font-mono" dir="ltr">{s.whatsappNumber}</span>
            </div>
            <div>
              <span className="text-slate-400">الحالة:</span>
              <span className="mr-2"><StatusBadge status={s.status} /></span>
            </div>
            {s.trialEndsAt && (
              <div className="col-span-2 space-y-0.5">
                <span className="text-slate-400">انتهاء الفترة التجريبية:</span>
                {(() => {
                  const d = formatDualDate(s.trialEndsAt!.split("T")[0]);
                  return (
                    <div className="mr-2 inline-block">
                      <span className="text-amber-400 font-medium">{d.gregorian}</span>
                      <span className="text-amber-600 text-xs mr-2">({d.hijri})</span>
                    </div>
                  );
                })()}
              </div>
            )}
            {s.mapsUrl && (
              <div className="col-span-2">
                <a href={s.mapsUrl} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 flex items-center gap-1 text-sm">
                  <MapPin className="w-4 h-4" />
                  عرض الموقع على الخريطة
                </a>
              </div>
            )}
          </div>

          {/* Description */}
          {s.descriptionAr && (
            <div>
              <p className="text-slate-400 text-sm font-semibold mb-1">الوصف</p>
              <p className="text-slate-200 text-sm leading-relaxed bg-slate-800 rounded-lg p-3">{s.descriptionAr}</p>
            </div>
          )}

          {/* Amenities */}
          {s.amenities && s.amenities.length > 0 && (
            <div>
              <p className="text-slate-400 text-sm font-semibold mb-2">المميزات</p>
              <div className="flex flex-wrap gap-2">
                {s.amenities.map((a) => (
                  <span key={a} className="text-xs bg-slate-700 text-slate-200 px-2 py-1 rounded-full">{a}</span>
                ))}
              </div>
            </div>
          )}

          {/* Photos */}
          {s.photos && s.photos.length > 0 && (
            <div>
              <p className="text-slate-400 text-sm font-semibold mb-2">الصور ({s.photos.length})</p>
              <div className="grid grid-cols-2 gap-2">
                {s.photos.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer">
                    <img
                      src={url}
                      alt={`صورة ${i + 1}`}
                      className="w-full h-36 object-cover rounded-lg border border-slate-700 hover:border-blue-500 transition-colors"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2 border-t border-slate-700">
            {s.status !== "approved" && (
              <Button
                className="flex-1 bg-green-700 hover:bg-green-600 text-white"
                onClick={() => { onApprove(s.id); onClose(); }}
                disabled={isPending}
              >
                <CheckCircle className="w-4 h-4 ml-2" />
                قبول الطلب
              </Button>
            )}
            {s.status !== "rejected" && (
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => { onReject(s.id); onClose(); }}
                disabled={isPending}
              >
                <XCircle className="w-4 h-4 ml-2" />
                رفض الطلب
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Submissions Tab ──────────────────────────── */
function SubmissionsTab() {
  const qc = useQueryClient();
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [reviewSubmission, setReviewSubmission] = useState<Submission | null>(null);

  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ["admin", "submissions"],
    queryFn: async () => {
      const r = await apiFetch("/admin/submissions");
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const r = await apiFetch(`/admin/submissions/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error("فشل التحديث");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "submissions"] }),
  });

  const deleteSubmission = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiFetch(`/admin/submissions/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("فشل الحذف");
    },
    onSuccess: () => {
      setDeleteId(null);
      qc.invalidateQueries({ queryKey: ["admin", "submissions"] });
    },
  });

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-slate-400 w-8 h-8" /></div>;
  }

  return (
    <>
      <SubmissionReviewModal
        submission={reviewSubmission}
        open={reviewSubmission !== null}
        onClose={() => setReviewSubmission(null)}
        onApprove={(id) => updateStatus.mutate({ id, status: "approved" })}
        onReject={(id) => updateStatus.mutate({ id, status: "rejected" })}
        isPending={updateStatus.isPending}
      />

      <div className="rounded-lg border border-slate-700 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-700 bg-slate-800">
              <TableHead className="text-slate-300 text-right font-semibold">اسم الشاليه</TableHead>
              <TableHead className="text-slate-300 text-right font-semibold">الموقع</TableHead>
              <TableHead className="text-slate-300 text-right font-semibold">واتساب</TableHead>
              <TableHead className="text-slate-300 text-right font-semibold">السعر</TableHead>
              <TableHead className="text-slate-300 text-right font-semibold">الحالة</TableHead>
              <TableHead className="text-slate-300 text-right font-semibold">التجربة تنتهي</TableHead>
              <TableHead className="text-slate-300 text-right font-semibold">التاريخ</TableHead>
              <TableHead className="text-slate-300 text-right font-semibold">الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {submissions.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-slate-400 py-12">لا توجد طلبات بعد</TableCell>
              </TableRow>
            )}
            {submissions.map((s: Submission) => (
              <TableRow key={s.id} className="border-slate-700 hover:bg-slate-800/50 transition-colors">
                <TableCell className="font-semibold text-white">{s.nameAr}</TableCell>
                <TableCell className="text-slate-300">
                  {s.location}
                  {s.district && <span className="block text-xs text-slate-500">{s.district}</span>}
                </TableCell>
                <TableCell className="text-slate-300 font-mono text-sm" dir="ltr">{s.whatsappNumber}</TableCell>
                <TableCell className="text-slate-300">{Number(s.pricePerNight).toLocaleString("ar-SA")} ر.س</TableCell>
                <TableCell><StatusBadge status={s.status} /></TableCell>
                <TableCell className="text-slate-400 text-sm">
                  {s.trialEndsAt ? (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(s.trialEndsAt).toLocaleDateString("ar-SA")}
                    </span>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </TableCell>
                <TableCell className="text-slate-400 text-sm">{new Date(s.createdAt).toLocaleDateString("ar-SA")}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-blue-400 hover:text-blue-300 hover:bg-blue-900/30"
                      onClick={() => setReviewSubmission(s)}
                      title="مراجعة"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    {s.status !== "approved" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 text-green-400 hover:text-green-300 hover:bg-green-900/30"
                        onClick={() => updateStatus.mutate({ id: s.id, status: "approved" })}
                        disabled={updateStatus.isPending}
                        title="قبول"
                      >
                        <CheckCircle className="w-4 h-4" />
                      </Button>
                    )}
                    {s.status !== "rejected" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 text-red-400 hover:text-red-300 hover:bg-red-900/30"
                        onClick={() => updateStatus.mutate({ id: s.id, status: "rejected" })}
                        disabled={updateStatus.isPending}
                        title="رفض"
                      >
                        <XCircle className="w-4 h-4" />
                      </Button>
                    )}
                    {s.mapsUrl && (
                      <a href={s.mapsUrl} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-blue-400 transition-colors">
                        <MapPin className="w-4 h-4" />
                      </a>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-slate-400 hover:text-red-400 hover:bg-red-900/20"
                      onClick={() => setDeleteId(s.id)}
                      title="حذف"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400 text-right">
              سيتم حذف هذا الطلب نهائياً ولا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel className="bg-slate-800 border-slate-700 text-white hover:bg-slate-700">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteId && deleteSubmission.mutate(deleteId)}
            >
              {deleteSubmission.isPending ? <Loader2 className="animate-spin w-4 h-4" /> : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ── Locations Tab ────────────────────────────── */
function LocationsTab() {
  const qc = useQueryClient();
  const [newCity, setNewCity] = useState("");
  const [newDistrict, setNewDistrict] = useState("");
  const [selectedCityId, setSelectedCityId] = useState<string>("");
  const [deleteDialog, setDeleteDialog] = useState<{ type: "city" | "district"; id: number } | null>(null);

  const { data: cities = [] } = useQuery({
    queryKey: ["admin", "cities"],
    queryFn: async () => {
      const r = await apiFetch("/admin/cities");
      if (!r.ok) throw new Error("فشل التحميل");
      return r.json();
    },
  });

  const { data: districts = [] } = useQuery({
    queryKey: ["admin", "districts"],
    queryFn: async () => {
      const r = await apiFetch("/admin/districts");
      if (!r.ok) throw new Error("فشل التحميل");
      return r.json();
    },
  });

  const addCity = useMutation({
    mutationFn: async (name: string) => {
      const r = await apiFetch("/admin/cities", { method: "POST", body: JSON.stringify({ name }) });
      if (!r.ok) throw new Error("فشل الإضافة");
    },
    onSuccess: () => {
      setNewCity("");
      qc.invalidateQueries({ queryKey: ["admin", "cities"] });
    },
  });

  const addDistrict = useMutation({
    mutationFn: async () => {
      const r = await apiFetch("/admin/districts", {
        method: "POST",
        body: JSON.stringify({ name: newDistrict, cityId: Number(selectedCityId) }),
      });
      if (!r.ok) throw new Error("فشل الإضافة");
    },
    onSuccess: () => {
      setNewDistrict("");
      qc.invalidateQueries({ queryKey: ["admin", "districts"] });
    },
  });

  const deleteItem = useMutation({
    mutationFn: async ({ type, id }: { type: "city" | "district"; id: number }) => {
      const path = type === "city" ? `/admin/cities/${id}` : `/admin/districts/${id}`;
      const r = await apiFetch(path, { method: "DELETE" });
      if (!r.ok) throw new Error("فشل الحذف");
    },
    onSuccess: () => {
      setDeleteDialog(null);
      qc.invalidateQueries({ queryKey: ["admin", "cities"] });
      qc.invalidateQueries({ queryKey: ["admin", "districts"] });
    },
  });

  const cityDistricts = districts.filter((d: District) => d.cityId === Number(selectedCityId));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Cities */}
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-5">
        <h3 className="text-white font-bold mb-4 text-lg">المدن</h3>
        <div className="flex gap-2 mb-4">
          <Input
            value={newCity}
            onChange={(e) => setNewCity(e.target.value)}
            placeholder="اسم المدينة"
            className="bg-slate-900 border-slate-600 text-white placeholder-slate-400"
            onKeyDown={(e) => e.key === "Enter" && newCity.trim() && addCity.mutate(newCity.trim())}
          />
          <Button
            onClick={() => newCity.trim() && addCity.mutate(newCity.trim())}
            disabled={!newCity.trim() || addCity.isPending}
            className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
          >
            {addCity.isPending ? <Loader2 className="animate-spin w-4 h-4" /> : "إضافة"}
          </Button>
        </div>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {cities.map((city: City) => (
            <div key={city.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-900 border border-slate-700">
              <span className="text-white font-medium">{city.name}</span>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full ${city.isActive ? "bg-green-900/50 text-green-400" : "bg-slate-700 text-slate-400"}`}>
                  {city.isActive ? "مفعّل" : "مخفي"}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-slate-400 hover:text-red-400"
                  onClick={() => setDeleteDialog({ type: "city", id: city.id })}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
          {cities.length === 0 && <p className="text-slate-500 text-center py-4">لا توجد مدن بعد</p>}
        </div>
      </div>

      {/* Districts */}
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-5">
        <h3 className="text-white font-bold mb-4 text-lg">الأحياء</h3>
        <div className="space-y-2 mb-4">
          <Select value={selectedCityId} onValueChange={setSelectedCityId}>
            <SelectTrigger className="bg-slate-900 border-slate-600 text-white">
              <SelectValue placeholder="اختر المدينة" />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-700">
              {cities.map((city: City) => (
                <SelectItem key={city.id} value={String(city.id)} className="text-white focus:bg-slate-700">{city.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Input
              value={newDistrict}
              onChange={(e) => setNewDistrict(e.target.value)}
              placeholder="اسم الحي"
              className="bg-slate-900 border-slate-600 text-white placeholder-slate-400"
              disabled={!selectedCityId}
            />
            <Button
              onClick={() => addDistrict.mutate()}
              disabled={!newDistrict.trim() || !selectedCityId || addDistrict.isPending}
              className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
            >
              {addDistrict.isPending ? <Loader2 className="animate-spin w-4 h-4" /> : "إضافة"}
            </Button>
          </div>
        </div>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {selectedCityId && cityDistricts.map((d: District) => (
            <div key={d.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-900 border border-slate-700">
              <span className="text-white">{d.name}</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-slate-400 hover:text-red-400"
                onClick={() => setDeleteDialog({ type: "district", id: d.id })}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
          {!selectedCityId && <p className="text-slate-500 text-center py-4">اختر مدينة لعرض أحيائها</p>}
          {selectedCityId && cityDistricts.length === 0 && <p className="text-slate-500 text-center py-4">لا توجد أحياء لهذه المدينة</p>}
        </div>
      </div>

      <AlertDialog open={deleteDialog !== null} onOpenChange={() => setDeleteDialog(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400 text-right">
              سيتم حذف هذا العنصر نهائياً.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel className="bg-slate-800 border-slate-700 text-white hover:bg-slate-700">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteDialog && deleteItem.mutate(deleteDialog)}
            >
              {deleteItem.isPending ? <Loader2 className="animate-spin w-4 h-4" /> : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ── Amenities Tab ────────────────────────────── */
function AmenitiesTab() {
  const qc = useQueryClient();
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: amenities = [] } = useQuery({
    queryKey: ["admin", "amenities"],
    queryFn: async () => {
      const r = await apiFetch("/admin/amenities");
      if (!r.ok) throw new Error("فشل التحميل");
      return r.json();
    },
  });

  const addAmenity = useMutation({
    mutationFn: async () => {
      const r = await apiFetch("/admin/amenities", {
        method: "POST",
        body: JSON.stringify({ key: newKey.trim(), labelAr: newLabel.trim() }),
      });
      if (!r.ok) throw new Error("فشل الإضافة");
    },
    onSuccess: () => {
      setNewKey("");
      setNewLabel("");
      qc.invalidateQueries({ queryKey: ["admin", "amenities"] });
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const r = await apiFetch(`/admin/amenities/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      });
      if (!r.ok) throw new Error("فشل التحديث");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "amenities"] }),
  });

  const deleteAmenity = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiFetch(`/admin/amenities/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("فشل الحذف");
    },
    onSuccess: () => {
      setDeleteId(null);
      qc.invalidateQueries({ queryKey: ["admin", "amenities"] });
    },
  });

  return (
    <>
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-5 mb-6">
        <h3 className="text-white font-bold mb-4">إضافة ميزة جديدة</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="المفتاح (بالإنجليزية، مثل: wifi)"
            className="bg-slate-900 border-slate-600 text-white placeholder-slate-400"
            dir="ltr"
          />
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="الاسم بالعربية (مثل: واي فاي)"
            className="bg-slate-900 border-slate-600 text-white placeholder-slate-400"
          />
          <Button
            onClick={() => addAmenity.mutate()}
            disabled={!newKey.trim() || !newLabel.trim() || addAmenity.isPending}
            className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
          >
            {addAmenity.isPending ? <Loader2 className="animate-spin w-4 h-4" /> : "إضافة"}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-700 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-700 bg-slate-800">
              <TableHead className="text-slate-300 text-right">المفتاح</TableHead>
              <TableHead className="text-slate-300 text-right">الاسم بالعربية</TableHead>
              <TableHead className="text-slate-300 text-right">الحالة</TableHead>
              <TableHead className="text-slate-300 text-right">إجراء</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {amenities.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-slate-400 py-12">لا توجد مرافق بعد</TableCell>
              </TableRow>
            )}
            {amenities.map((a: Amenity) => (
              <TableRow key={a.id} className="border-slate-700 hover:bg-slate-800/50">
                <TableCell className="font-mono text-sm text-slate-400" dir="ltr">{a.key}</TableCell>
                <TableCell className="text-white font-medium">{a.labelAr}</TableCell>
                <TableCell>
                  <button
                    onClick={() => toggleActive.mutate({ id: a.id, isActive: !a.isActive })}
                    className={`text-xs px-2.5 py-1 rounded-full font-semibold transition-colors ${
                      a.isActive
                        ? "bg-green-900/50 text-green-400 hover:bg-green-900"
                        : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                    }`}
                  >
                    {a.isActive ? "مفعّل" : "مخفي"}
                  </button>
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-slate-400 hover:text-red-400"
                    onClick={() => setDeleteId(a.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400 text-right">
              سيتم حذف هذه الميزة نهائياً.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel className="bg-slate-800 border-slate-700 text-white hover:bg-slate-700">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteId !== null && deleteAmenity.mutate(deleteId)}
            >
              {deleteAmenity.isPending ? <Loader2 className="animate-spin w-4 h-4" /> : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ── Owners Tab ───────────────────────────────── */
function OwnersTab() {
  const { data: owners = [], isLoading } = useQuery({
    queryKey: ["admin", "owners"],
    queryFn: async () => {
      const r = await apiFetch("/admin/owners");
      if (!r.ok) throw new Error("فشل التحميل");
      return r.json();
    },
  });

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-slate-400 w-8 h-8" /></div>;
  }

  return (
    <div className="rounded-lg border border-slate-700 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="border-slate-700 bg-slate-800">
            <TableHead className="text-slate-300 text-right">معرف المالك</TableHead>
            <TableHead className="text-slate-300 text-right">اسم الشاليه الأول</TableHead>
            <TableHead className="text-slate-300 text-right">واتساب</TableHead>
            <TableHead className="text-slate-300 text-right">تاريخ الانضمام</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {owners.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-slate-400 py-12">لا يوجد ملاك بعد</TableCell>
            </TableRow>
          )}
          {owners.map((owner: Owner) => (
            <TableRow key={owner.ownerId} className="border-slate-700 hover:bg-slate-800/50">
              <TableCell className="font-mono text-xs text-slate-400 max-w-[150px] truncate" dir="ltr">{owner.ownerId}</TableCell>
              <TableCell className="text-white font-medium">{owner.nameAr}</TableCell>
              <TableCell className="text-slate-300 font-mono text-sm" dir="ltr">{owner.whatsappNumber}</TableCell>
              <TableCell className="text-slate-400 text-sm">{new Date(owner.createdAt).toLocaleDateString("ar-SA")}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/* ── Services Tab ─────────────────────────────── */
const SERVICE_CATEGORIES = [
  { value: "bounce_houses",       label: "نطيطات",      emoji: "🎪" },
  { value: "ice_cream",           label: "آيس كريم",    emoji: "🍦" },
  { value: "productive_families", label: "أسر منتجة",  emoji: "🎀" },
] as const;

interface ServiceFormData {
  nameAr: string;
  category: ServiceCategory;
  descriptionAr: string;
  whatsappNumber: string;
  price: string;
  priceNote: string;
  city: string;
}

const BLANK_SERVICE: ServiceFormData = {
  nameAr: "", category: "bounce_houses", descriptionAr: "",
  whatsappNumber: "", price: "", priceNote: "", city: "",
};

function ServicesTab() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<ServiceFormData>(BLANK_SERVICE);

  const { data: services = [], isLoading } = useQuery({
    queryKey: ["admin", "services"],
    queryFn: async () => {
      const r = await apiFetch("/admin/services");
      if (!r.ok) throw new Error("فشل التحميل");
      return r.json();
    },
  });

  const saveService = useMutation({
    mutationFn: async () => {
      const payload = {
        nameAr: form.nameAr,
        category: form.category,
        descriptionAr: form.descriptionAr,
        whatsappNumber: form.whatsappNumber,
        price: form.price ? Number(form.price) : undefined,
        priceNote: form.priceNote || undefined,
        city: form.city || undefined,
      };
      const url = editId ? `/admin/services/${editId}` : "/admin/services";
      const method = editId ? "PATCH" : "POST";
      const r = await apiFetch(url, { method, body: JSON.stringify(payload) });
      if (!r.ok) throw new Error("فشل الحفظ");
    },
    onSuccess: () => {
      setShowForm(false);
      setEditId(null);
      setForm(BLANK_SERVICE);
      qc.invalidateQueries({ queryKey: ["admin", "services"] });
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const r = await apiFetch(`/admin/services/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      });
      if (!r.ok) throw new Error("فشل التحديث");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "services"] }),
  });

  const deleteService = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiFetch(`/admin/services/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("فشل الحذف");
    },
    onSuccess: () => {
      setDeleteId(null);
      qc.invalidateQueries({ queryKey: ["admin", "services"] });
    },
  });

  const handleEdit = (svc: Service) => {
    setEditId(svc.id);
    setForm({
      nameAr: svc.nameAr,
      category: svc.category,
      descriptionAr: svc.descriptionAr,
      whatsappNumber: svc.whatsappNumber,
      price: svc.price ?? "",
      priceNote: svc.priceNote ?? "",
      city: svc.city ?? "",
    });
    setShowForm(true);
  };

  return (
    <>
      {/* Add/Edit Form */}
      {showForm ? (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 mb-6">
          <h3 className="text-white font-bold text-lg mb-5">
            {editId ? "تعديل الخدمة" : "إضافة خدمة جديدة"}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-slate-300 text-sm font-medium">اسم الخدمة *</label>
              <Input
                value={form.nameAr}
                onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))}
                placeholder="مثال: نطاطة كبيرة للأطفال"
                className="bg-slate-900 border-slate-600 text-white placeholder-slate-400"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-300 text-sm font-medium">الفئة *</label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v as ServiceCategory }))}>
                <SelectTrigger className="bg-slate-900 border-slate-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700">
                  {SERVICE_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value} className="text-white focus:bg-slate-700">
                      {c.emoji} {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-300 text-sm font-medium">رقم الواتساب *</label>
              <Input
                value={form.whatsappNumber}
                onChange={(e) => setForm((f) => ({ ...f, whatsappNumber: e.target.value }))}
                placeholder="966501234567"
                className="bg-slate-900 border-slate-600 text-white placeholder-slate-400"
                dir="ltr"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-300 text-sm font-medium">المدينة</label>
              <Input
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                placeholder="بريدة"
                className="bg-slate-900 border-slate-600 text-white placeholder-slate-400"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <div className="rounded-lg bg-[#25D366]/10 border border-[#25D366]/30 px-3 py-2">
                <p className="text-[#25D366] text-sm font-semibold">الأسعار عند التواصل مع المالك</p>
                <p className="text-slate-400 text-xs mt-0.5">سيتواصل العملاء مع مزود الخدمة مباشرةً للاستفسار</p>
              </div>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-slate-300 text-sm font-medium">وصف الخدمة *</label>
              <Textarea
                value={form.descriptionAr}
                onChange={(e) => setForm((f) => ({ ...f, descriptionAr: e.target.value }))}
                placeholder="اكتب تفاصيل الخدمة: المميزات، الأبعاد، ما يشمله العرض..."
                className="bg-slate-900 border-slate-600 text-white placeholder-slate-400 min-h-[100px] resize-none"
              />
            </div>
          </div>

          <div className="flex gap-3 mt-5 justify-end">
            <Button
              variant="ghost"
              className="text-slate-400 hover:text-white hover:bg-slate-700"
              onClick={() => { setShowForm(false); setEditId(null); setForm(BLANK_SERVICE); }}
            >
              إلغاء
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => saveService.mutate()}
              disabled={!form.nameAr || !form.descriptionAr || !form.whatsappNumber || saveService.isPending}
            >
              {saveService.isPending ? <Loader2 className="animate-spin w-4 h-4" /> : (editId ? "حفظ التعديلات" : "إضافة الخدمة")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end mb-4">
          <Button
            onClick={() => setShowForm(true)}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            <Plus className="w-4 h-4 me-1.5" />
            إضافة خدمة
          </Button>
        </div>
      )}

      {/* Services Table */}
      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-slate-400 w-8 h-8" /></div>
      ) : (
        <div className="rounded-lg border border-slate-700 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700 bg-slate-800">
                <TableHead className="text-slate-300 text-right">الخدمة</TableHead>
                <TableHead className="text-slate-300 text-right">الفئة</TableHead>
                <TableHead className="text-slate-300 text-right">المدينة</TableHead>
                <TableHead className="text-slate-300 text-right">السعر</TableHead>
                <TableHead className="text-slate-300 text-right">الحالة</TableHead>
                <TableHead className="text-slate-300 text-right">إجراء</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-slate-400 py-12">
                    لا توجد خدمات — اضغط "إضافة خدمة" للبدء
                  </TableCell>
                </TableRow>
              )}
              {services.map((svc: Service) => {
                const cat = SERVICE_CATEGORIES.find((c) => c.value === svc.category);
                return (
                  <TableRow key={svc.id} className="border-slate-700 hover:bg-slate-800/50">
                    <TableCell>
                      <div className="font-semibold text-white">{svc.nameAr}</div>
                      <div className="text-slate-400 text-xs mt-0.5 line-clamp-1">{svc.descriptionAr}</div>
                    </TableCell>
                    <TableCell className="text-slate-300">
                      {cat ? `${cat.emoji} ${cat.label}` : svc.category}
                    </TableCell>
                    <TableCell className="text-slate-300">{svc.city ?? "—"}</TableCell>
                    <TableCell className="text-slate-300">
                      {svc.price
                        ? `${Number(svc.price).toLocaleString("ar-SA")} ر.س`
                        : svc.priceNote ?? "بالاتفاق"}
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => toggleActive.mutate({ id: svc.id, isActive: !svc.isActive })}
                        className={`text-xs px-2.5 py-1 rounded-full font-semibold transition-colors ${
                          svc.isActive
                            ? "bg-green-900/50 text-green-400 hover:bg-green-900"
                            : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                        }`}
                      >
                        {svc.isActive ? "مفعّل" : "مخفي"}
                      </button>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm" variant="ghost"
                          className="h-8 px-2 text-slate-400 hover:text-amber-400"
                          onClick={() => handleEdit(svc)}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <a
                          href={`https://wa.me/${svc.whatsappNumber.replace(/\D/g, "")}`}
                          target="_blank" rel="noreferrer"
                          className="text-slate-400 hover:text-green-400 transition-colors p-2"
                        >
                          <Phone className="w-3.5 h-3.5" />
                        </a>
                        <Button
                          size="sm" variant="ghost"
                          className="h-8 px-2 text-slate-400 hover:text-red-400"
                          onClick={() => setDeleteId(svc.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400 text-right">
              سيتم حذف هذه الخدمة نهائياً.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel className="bg-slate-800 border-slate-700 text-white hover:bg-slate-700">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteId !== null && deleteService.mutate(deleteId)}
            >
              {deleteService.isPending ? <Loader2 className="animate-spin w-4 h-4" /> : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ── Categories Tab ───────────────────────────── */
function CategoriesTab() {
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);

  interface Category { id: number; nameAr: string; isActive: boolean }

  const { data: categories = [], isLoading } = useQuery<Category[]>({
    queryKey: ["admin", "categories"],
    queryFn: async () => {
      const r = await apiFetch("/admin/categories");
      if (!r.ok) throw new Error("فشل التحميل");
      return r.json();
    },
  });

  const addCategory = useMutation({
    mutationFn: async (nameAr: string) => {
      const r = await apiFetch("/admin/categories", { method: "POST", body: JSON.stringify({ nameAr }) });
      if (!r.ok) throw new Error("فشل الإضافة");
    },
    onSuccess: () => { setNewName(""); qc.invalidateQueries({ queryKey: ["admin", "categories"] }); },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const r = await apiFetch(`/admin/categories/${id}`, { method: "PATCH", body: JSON.stringify({ isActive }) });
      if (!r.ok) throw new Error("فشل التحديث");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "categories"] }),
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiFetch(`/admin/categories/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("فشل الحذف");
    },
    onSuccess: () => { setDeleteId(null); qc.invalidateQueries({ queryKey: ["admin", "categories"] }); },
  });

  return (
    <div className="space-y-6">
      <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
        <h3 className="text-slate-200 font-semibold mb-4">إضافة فئة جديدة</h3>
        <div className="flex gap-3">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="مثال: شالية، مزرعة، استراحة"
            className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500 flex-1"
            onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) addCategory.mutate(newName.trim()); }}
          />
          <Button
            onClick={() => newName.trim() && addCategory.mutate(newName.trim())}
            disabled={addCategory.isPending || !newName.trim()}
            className="bg-amber-600 hover:bg-amber-700"
          >
            <Plus className="w-4 h-4 me-1" />
            إضافة
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-400 w-6 h-6" /></div>
      ) : categories.length === 0 ? (
        <p className="text-slate-400 text-center py-10">لا توجد فئات بعد</p>
      ) : (
        <div className="rounded-xl border border-slate-700 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700 bg-slate-800">
                <TableHead className="text-slate-300 text-right">اسم الفئة</TableHead>
                <TableHead className="text-slate-300 text-right">الحالة</TableHead>
                <TableHead className="text-slate-300 text-right">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((cat) => (
                <TableRow key={cat.id} className="border-slate-700 hover:bg-slate-800/50">
                  <TableCell className="text-white font-medium">{cat.nameAr}</TableCell>
                  <TableCell>
                    <button
                      onClick={() => toggleActive.mutate({ id: cat.id, isActive: !cat.isActive })}
                      className={`text-xs px-2.5 py-1 rounded-full font-semibold ${cat.isActive ? "bg-green-900/50 text-green-400" : "bg-slate-700 text-slate-400"}`}
                    >
                      {cat.isActive ? "مفعّل" : "مخفي"}
                    </button>
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" className="h-8 px-2 text-slate-400 hover:text-red-400" onClick={() => setDeleteId(cat.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400 text-right">سيتم حذف هذه الفئة نهائياً.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel className="bg-slate-800 border-slate-700 text-white hover:bg-slate-700">إلغاء</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteId && deleteCategory.mutate(deleteId)}>
              {deleteCategory.isPending ? <Loader2 className="animate-spin w-4 h-4" /> : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ── Site Settings Tab ────────────────────────── */
function SettingsTab() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const settingFields = [
    { key: "platform_whatsapp", label: "رقم واتساب المنصة", placeholder: "966500000000" },
    { key: "platform_email",    label: "البريد الإلكتروني",  placeholder: "info@example.com" },
    { key: "facebook_url",      label: "رابط فيسبوك",        placeholder: "https://facebook.com/..." },
    { key: "twitter_url",       label: "رابط تويتر/X",       placeholder: "https://x.com/..." },
    { key: "instagram_url",     label: "رابط إنستقرام",      placeholder: "https://instagram.com/..." },
    { key: "about_text",        label: "نص عن المنصة",       placeholder: "وصف قصير عن المنصة..." },
  ];

  const { data: settings, isLoading } = useQuery<Record<string, string>>({
    queryKey: ["admin", "settings"],
    queryFn: async () => {
      const r = await apiFetch("/admin/settings");
      if (!r.ok) throw new Error("فشل التحميل");
      return r.json();
    },
  });

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  const saveSettings = useMutation({
    mutationFn: async (data: Record<string, string>) => {
      const r = await apiFetch("/admin/settings", { method: "PATCH", body: JSON.stringify(data) });
      if (!r.ok) throw new Error("فشل الحفظ");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "settings"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  if (isLoading) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-400 w-6 h-6" /></div>;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 space-y-5">
        <h3 className="text-slate-200 font-semibold text-lg">إعدادات الموقع</h3>
        {settingFields.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <label className="text-sm font-medium text-slate-300">{field.label}</label>
            {field.key === "about_text" ? (
              <Textarea
                value={form[field.key] ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                placeholder={field.placeholder}
                rows={3}
                className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500"
              />
            ) : (
              <Input
                value={form[field.key] ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                placeholder={field.placeholder}
                className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500"
                dir={field.key.includes("url") || field.key.includes("whatsapp") || field.key.includes("email") ? "ltr" : "rtl"}
              />
            )}
          </div>
        ))}
        <Button
          onClick={() => saveSettings.mutate(form)}
          disabled={saveSettings.isPending}
          className="bg-amber-600 hover:bg-amber-700 w-full"
        >
          {saved ? "✓ تم الحفظ" : saveSettings.isPending ? "جاري الحفظ..." : "حفظ الإعدادات"}
        </Button>
      </div>
    </div>
  );
}

/* ── Main Admin Page ──────────────────────────── */
const TABS = [
  { id: "submissions", label: "الطلبات",          icon: Settings },
  { id: "services",    label: "خدمات المناسبات",  icon: Wrench },
  { id: "locations",   label: "المدن والأحياء",   icon: Building2 },
  { id: "amenities",   label: "المرافق",           icon: Tag },
  { id: "categories",  label: "الفئات",            icon: Tag },
  { id: "owners",      label: "الملاك",            icon: Users },
  { id: "siteSettings", label: "إعدادات الموقع", icon: Settings },
] as const;

type TabId = typeof TABS[number]["id"];

export default function Admin() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("submissions");

  const { data: accessCheck, isLoading: checkLoading, error: checkError } = useQuery({
    queryKey: ["admin", "check"],
    queryFn: async () => {
      const r = await apiFetch("/admin/submissions");
      if (r.status === 401) throw new Error("401");
      if (r.status === 403) throw new Error("403");
      return r.json();
    },
    retry: false,
  });

  if (isLoading || checkLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="animate-spin text-amber-400 w-10 h-10" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white">
        <h1 className="text-2xl font-bold mb-2">يجب تسجيل الدخول</h1>
        <a href={`${BASE}/api/auth/login`} className="mt-4 px-6 py-2 bg-amber-600 rounded-lg font-semibold hover:bg-amber-700">
          تسجيل الدخول
        </a>
      </div>
    );
  }

  if (checkError?.message === "403" || checkError?.message === "401") {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white px-4" dir="rtl">
        <div className="text-6xl mb-6">🔐</div>
        <h1 className="text-2xl font-bold mb-2">إعداد حساب الإدارة</h1>
        <p className="text-slate-400 mb-8 text-center max-w-md">
          لتفعيل صلاحيات الإدارة، انسخ معرّفك أدناه وأضفه كمتغير بيئة باسم{" "}
          <code className="bg-slate-700 text-amber-400 px-1.5 py-0.5 rounded font-mono text-sm">ADMIN_USER_ID</code>
        </p>

        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-sm mb-6">
          <p className="text-slate-400 text-xs mb-2 font-semibold uppercase tracking-wider">معرّف حسابك</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-slate-900 text-amber-300 text-sm font-mono px-3 py-2.5 rounded-lg border border-slate-600 break-all select-all">
              {user?.id ?? "—"}
            </code>
            <button
              onClick={() => {
                if (user?.id) navigator.clipboard.writeText(user.id);
              }}
              className="shrink-0 px-3 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold transition-colors"
            >
              نسخ
            </button>
          </div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 w-full max-w-sm text-sm mb-8">
          <p className="text-slate-300 font-semibold mb-3">خطوات الإعداد:</p>
          <ol className="text-slate-400 space-y-2 list-decimal list-inside">
            <li>انسخ المعرّف أعلاه</li>
            <li>افتح إعدادات المشروع في Replit</li>
            <li>أضف متغير بيئة: <code className="text-amber-400 bg-slate-700 px-1 rounded">ADMIN_USER_ID</code></li>
            <li>الصق المعرّف كقيمة للمتغير</li>
            <li>أعد تشغيل السيرفر وحدّث الصفحة</li>
          </ol>
        </div>

        <a href={BASE || "/"} className="text-slate-400 hover:text-white transition-colors text-sm">
          ← العودة إلى الرئيسية
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white" dir="rtl">
      {/* Header */}
      <header className="bg-slate-950 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
            <Settings className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-white font-bold text-lg leading-none">لوحة التحكم</h1>
            <p className="text-slate-400 text-xs mt-0.5">شاليهات القصيم</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-slate-400 text-sm hidden sm:block">{[user?.firstName, user?.lastName].filter(Boolean).join(" ")}</span>
          <a
            href={BASE || "/"}
            className="text-slate-400 hover:text-white text-sm transition-colors"
          >
            العودة للموقع ←
          </a>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="bg-slate-900 border-b border-slate-700 px-6">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === id
                  ? "border-amber-500 text-amber-400"
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <main className="p-6 max-w-7xl mx-auto">
        {/* Stats row */}
        {activeTab === "submissions"  && <SubmissionsTab />}
        {activeTab === "services"     && <ServicesTab />}
        {activeTab === "locations"    && <LocationsTab />}
        {activeTab === "amenities"    && <AmenitiesTab />}
        {activeTab === "categories"   && <CategoriesTab />}
        {activeTab === "owners"       && <OwnersTab />}
        {activeTab === "siteSettings" && <SettingsTab />}
      </main>
    </div>
  );
}
