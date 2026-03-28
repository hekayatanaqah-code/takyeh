import { useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useAuth } from "@workspace/replit-auth-web";
import { useGetMySubmissions } from "@workspace/api-client-react";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  User,
  LogOut,
  Plus,
  MapPin,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  Home,
} from "lucide-react";
import { Link } from "wouter";

const statusConfig = {
  pending: {
    label: "قيد المراجعة",
    icon: <Clock className="w-3.5 h-3.5" />,
    className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
  approved: {
    label: "تمت الموافقة",
    icon: <CheckCircle className="w-3.5 h-3.5" />,
    className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  },
  rejected: {
    label: "مرفوض",
    icon: <XCircle className="w-3.5 h-3.5" />,
    className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  },
};

export default function Dashboard() {
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const { data: submissions, isLoading: submissionsLoading } = useGetMySubmissions();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/");
    }
  }, [authLoading, isAuthenticated, navigate]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <Navbar />
        <div className="container mx-auto px-4 py-12 max-w-4xl space-y-6">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Navbar />

      <div className="container mx-auto px-4 py-10 max-w-4xl">
        {/* Owner Profile Card */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-3xl p-6 md:p-8 mb-8 flex flex-col sm:flex-row items-start sm:items-center gap-5 shadow-sm"
        >
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            {user?.profileImageUrl ? (
              <img
                src={user.profileImageUrl}
                alt={user.firstName ?? ""}
                className="w-16 h-16 rounded-2xl object-cover"
              />
            ) : (
              <User className="w-8 h-8 text-primary" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-foreground">
              أهلاً، {user?.firstName ?? "مالك الشاليه"} 👋
            </h1>
            <p className="text-muted-foreground mt-1">
              مرحباً بك في لوحة تحكم ملاك الشاليهات
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Link href="/add-chalet">
              <Button className="rounded-xl font-semibold">
                <Plus className="w-4 h-4 me-2" />
                إضافة شاليه
              </Button>
            </Link>
            <Button
              variant="outline"
              onClick={logout}
              className="rounded-xl text-muted-foreground hover:text-destructive hover:border-destructive"
            >
              <LogOut className="w-4 h-4 me-2" />
              تسجيل خروج
            </Button>
          </div>
        </motion.div>

        {/* Submissions Section */}
        <div>
          <h2 className="text-xl font-bold text-foreground mb-5 flex items-center gap-2">
            <Home className="w-5 h-5 text-primary" />
            شاليهاتي المقدمة
            {submissions && (
              <span className="text-sm font-normal text-muted-foreground">
                ({submissions.length} شاليه)
              </span>
            )}
          </h2>

          {submissionsLoading ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-36 w-full rounded-2xl" />
              ))}
            </div>
          ) : submissions && submissions.length > 0 ? (
            <div className="space-y-4">
              {submissions.map((sub, idx) => {
                const status = statusConfig[sub.status as keyof typeof statusConfig] ?? statusConfig.pending;
                return (
                  <motion.div
                    key={sub.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.08 }}
                    className="bg-card border border-border rounded-2xl p-5 md:p-6 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                      {sub.photos?.[0] ? (
                        <img
                          src={sub.photos[0]}
                          alt={sub.nameAr}
                          className="w-full sm:w-28 h-20 object-cover rounded-xl shrink-0"
                        />
                      ) : (
                        <div className="w-full sm:w-28 h-20 bg-muted rounded-xl shrink-0 flex items-center justify-center">
                          <Home className="w-8 h-8 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <h3 className="text-lg font-bold text-foreground">{sub.nameAr}</h3>
                          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full ${status.className}`}>
                            {status.icon}
                            {status.label}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5" />
                            {sub.location}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="font-medium text-foreground">{Number(sub.pricePerNight).toLocaleString("ar-SA")} ر.س</span>
                            / الليلة
                          </span>
                          {sub.createdAt && (
                            <span className="flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5" />
                              {new Date(sub.createdAt).toLocaleDateString("ar-SA")}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{sub.descriptionAr}</p>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-card border border-dashed border-border rounded-2xl p-12 text-center"
            >
              <Home className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">لا توجد شاليهات بعد</h3>
              <p className="text-muted-foreground mb-6">ابدأ بإضافة شاليهك الأول للمراجعة والنشر</p>
              <Link href="/add-chalet">
                <Button>
                  <Plus className="w-4 h-4 me-2" />
                  إضافة شاليه جديد
                </Button>
              </Link>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
