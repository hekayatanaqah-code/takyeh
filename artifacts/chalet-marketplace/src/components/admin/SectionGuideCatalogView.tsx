import React, { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Building2, Wrench, DollarSign, BookOpen } from "lucide-react";
import { SECTION_GUIDE_GROUPS, type GuideActivity, type GuideSection } from "@/lib/sectionGuideCatalog";

const ICONS: Record<GuideActivity, typeof Building2> = { property: Building2, service: Wrench };

export function SectionGuideCatalogView({ renderSection }: { renderSection: (section: GuideSection) => ReactNode }) {
  const [active, setActive] = useState<GuideActivity>(SECTION_GUIDE_GROUPS[0]?.activity ?? "property");
  const baseId = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const n = SECTION_GUIDE_GROUPS.length;
    let next = -1;
    // RTL: ArrowLeft moves forward
    if (e.key === "ArrowLeft") next = (i + 1) % n;
    else if (e.key === "ArrowRight") next = (i - 1 + n) % n;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    if (next < 0) return;
    e.preventDefault();
    setActive(SECTION_GUIDE_GROUPS[next].activity);
    tabRefs.current[next]?.focus();
  }

  return (
    <div dir="rtl" className="space-y-6">
      <div role="tablist" aria-label="نوع الشروحات" className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-1.5 rounded-2xl bg-slate-900/70 border border-slate-700">
        {SECTION_GUIDE_GROUPS.map((g, i) => {
          const Icon = ICONS[g.activity];
          const selected = g.activity === active;
          return (
            <button
              key={g.activity}
              ref={el => { tabRefs.current[i] = el; }}
              id={`${baseId}-tab-${g.activity}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${g.activity}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(g.activity)}
              onKeyDown={e => onKey(e, i)}
              className={`flex items-start gap-3 text-right rounded-xl px-4 py-3.5 border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                selected ? "bg-amber-500/15 border-amber-500/60 text-amber-200" : "bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500"
              }`}
            >
              <span className={`w-10 h-10 shrink-0 rounded-lg flex items-center justify-center ${selected ? "bg-amber-500 text-slate-900" : "bg-slate-700 text-slate-300"}`}>
                <Icon className="w-5 h-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-bold text-base">{g.title}</span>
                <span className="block text-xs text-slate-400 mt-0.5 leading-relaxed">{g.description}</span>
              </span>
            </button>
          );
        })}
      </div>

      {SECTION_GUIDE_GROUPS.map(g => (
        <div
          key={g.activity}
          role="tabpanel"
          id={`${baseId}-panel-${g.activity}`}
          aria-labelledby={`${baseId}-tab-${g.activity}`}
          hidden={g.activity !== active}
          className="space-y-6"
        >
          <section className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            <div className="bg-gradient-to-l from-amber-500/10 to-transparent px-6 py-4 border-b border-slate-700 flex items-center gap-3">
              <BookOpen className="w-5 h-5 text-amber-400" />
              <h3 className="text-slate-100 font-bold text-lg">{g.title}</h3>
              <span className="text-xs text-slate-500 mr-auto">{g.sections.length} قسم</span>
            </div>
            <div className="p-4 sm:p-6 space-y-3">
              {g.sections.map(s => <div key={s.key}>{renderSection(s)}</div>)}
            </div>
          </section>

          <section className="bg-slate-800 rounded-xl border border-emerald-500/30 overflow-hidden">
            <div className="bg-gradient-to-l from-emerald-500/10 to-transparent px-6 py-4 border-b border-slate-700 flex items-center gap-3">
              <DollarSign className="w-5 h-5 text-emerald-400" />
              <h3 className="text-slate-100 font-bold text-lg">{g.financeTitle}</h3>
            </div>
            <div className="p-4 sm:p-6 space-y-4">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-1">
                {renderSection(g.financeOverview)}
              </div>
              <div className="space-y-3 border-r-2 border-slate-700 pr-3">
                {g.financeSections.map(s => <div key={s.key}>{renderSection(s)}</div>)}
              </div>
            </div>
          </section>
        </div>
      ))}
    </div>
  );
}

export default SectionGuideCatalogView;
