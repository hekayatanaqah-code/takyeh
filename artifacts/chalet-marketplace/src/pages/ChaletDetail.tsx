import { useParams, Link } from "wouter";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";

export default function ChaletDetail() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-24 text-center">
        <div className="max-w-md w-full space-y-6">
          <div className="text-6xl mb-2">🏡</div>
          <h1 className="text-2xl font-bold text-foreground">صفحة الشاليه #{id}</h1>
          <p className="text-muted-foreground text-sm">
            قيد الإعداد — سيتم تحديث هذه الصفحة قريباً بالمحتوى الكامل.
          </p>
          <Link href="/chalets">
            <Button className="w-full">العودة لقائمة الشاليهات</Button>
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
