import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, ChevronRight, X, Play } from "lucide-react";
import { toAr } from "@/lib/utils";
import { apiFetch } from "@/components/owner/owner-api";


/* ══ Section Guide helpers ════════════════════════════════════════ */
function getYouTubeEmbedUrl(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([A-Za-z0-9_-]{11})/);
  if (!m) return null;
  return `https://www.youtube.com/embed/${m[1]}?rel=0&modestbranding=1`;
}

type GuideVideo = { id: number; section_key: string; title: string; video_url: string };

export function SectionGuideButton({ sectionKey }: { sectionKey: string }) {
  const [open, setOpen] = useState(false);
  const [activeVideo, setActiveVideo] = useState<GuideVideo | null>(null);

  const { data: guides = [] } = useQuery<GuideVideo[]>({
    queryKey: ["section-guides"],
    queryFn: async () => {
      const r = await apiFetch("/owner/section-guides");
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 5 * 60_000,
  });

  const sectionVideos = guides.filter(g => g.section_key === sectionKey);
  if (sectionVideos.length === 0) return null;

  function openModal() { setActiveVideo(null); setOpen(true); }
  function closeModal() { setOpen(false); setActiveVideo(null); }

  return (
    <>
      <button
        onClick={openModal}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold transition-colors"
      >
        <Play className="w-3 h-3 fill-primary" />
        شروحات القسم
        {sectionVideos.length > 1 && (
          <span className="bg-primary/20 text-primary rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none">
            {toAr(sectionVideos.length)}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={closeModal}
        >
          <div
            className="bg-background rounded-2xl shadow-2xl overflow-hidden w-full max-w-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                {activeVideo && (
                  <button
                    onClick={() => setActiveVideo(null)}
                    className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted transition-colors me-1"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
                <BookOpen className="w-4 h-4 text-primary shrink-0" />
                <h3 className="font-bold text-foreground text-sm">
                  {activeVideo ? activeVideo.title : "شروحات القسم"}
                </h3>
              </div>
              <button onClick={closeModal} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg hover:bg-muted">
                <X className="w-5 h-5" />
              </button>
            </div>

            {activeVideo ? (
              <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
                {getYouTubeEmbedUrl(activeVideo.video_url) ? (
                  <iframe
                    src={getYouTubeEmbedUrl(activeVideo.video_url) ?? ""}
                    className="absolute inset-0 w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <video
                    src={activeVideo.video_url}
                    className="absolute inset-0 h-full w-full bg-black"
                    controls
                    playsInline
                  />
                )}
              </div>
            ) : (
              <div className="divide-y divide-border max-h-96 overflow-y-auto">
                {sectionVideos.map((v, i) => (
                  <button
                    key={v.id}
                    onClick={() => setActiveVideo(v)}
                    className="w-full flex items-center gap-3 px-5 py-4 hover:bg-muted/50 transition-colors text-start"
                  >
                    <span className="w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                      {toAr(i + 1)}
                    </span>
                    <span className="flex-1 text-sm font-medium text-foreground">{v.title}</span>
                    <Play className="w-4 h-4 text-primary fill-primary/60 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
