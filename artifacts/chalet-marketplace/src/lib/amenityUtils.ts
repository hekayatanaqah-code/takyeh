export interface AmenityInfo {
  ar: string;
  icon: string;
  color: string;
}

/**
 * Comprehensive fallback map — covers every known key from:
 *   • DB seed (indoor_pool, water_games, basketball_court, cinema_room …)
 *   • Legacy keys stored in older data (pool, football, billiards, cinema …)
 * The DB catalog always takes priority when provided.
 */
export const AMENITY_FALLBACK: Record<string, AmenityInfo> = {
  indoor_pool:       { ar: "مسبح داخلي",        icon: "🏊",  color: "bg-blue-500/15 border-blue-500/25 text-blue-300"        },
  outdoor_pool:      { ar: "مسبح خارجي",         icon: "🌊",  color: "bg-blue-400/15 border-blue-400/25 text-blue-300"        },
  pool:              { ar: "مسبح",                icon: "🏊",  color: "bg-blue-500/15 border-blue-500/25 text-blue-300"        },
  kids_games:        { ar: "ألعاب أطفال",         icon: "🎠",  color: "bg-pink-500/15 border-pink-500/25 text-pink-300"        },
  water_games:       { ar: "ألعاب مائية",         icon: "💦",  color: "bg-sky-500/15 border-sky-500/25 text-sky-300"           },
  large_garden:      { ar: "حديقة كبيرة",         icon: "🌳",  color: "bg-green-400/15 border-green-400/25 text-green-300"     },
  garden:            { ar: "حديقة",               icon: "🌿",  color: "bg-green-500/15 border-green-500/25 text-green-300"     },
  bbq:               { ar: "ركن شواء",             icon: "🔥",  color: "bg-orange-500/15 border-orange-500/25 text-orange-300" },
  bbq_outdoor:       { ar: "شواء خارجي",           icon: "🍖",  color: "bg-orange-400/15 border-orange-400/25 text-orange-300" },
  private_majlis:    { ar: "مجالس مستقلة",         icon: "🛋️",  color: "bg-amber-500/15 border-amber-500/25 text-amber-300"    },
  football_court:    { ar: "ملعب كرة قدم",         icon: "⚽",  color: "bg-green-500/15 border-green-500/25 text-green-300"    },
  football:          { ar: "ملعب كرة قدم",         icon: "⚽",  color: "bg-green-500/15 border-green-500/25 text-green-300"    },
  basketball_court:  { ar: "ملعب كرة سلة",         icon: "🏀",  color: "bg-orange-400/15 border-orange-400/25 text-orange-300" },
  billiard:          { ar: "بلياردو",              icon: "🎱",  color: "bg-stone-500/15 border-stone-500/25 text-stone-300"    },
  billiards:         { ar: "بلياردو",              icon: "🎱",  color: "bg-stone-500/15 border-stone-500/25 text-stone-300"    },
  table_tennis:      { ar: "تنس طاولة",            icon: "🏓",  color: "bg-emerald-500/15 border-emerald-500/25 text-emerald-300" },
  playground:        { ar: "ملعب أطفال",           icon: "🎠",  color: "bg-pink-400/15 border-pink-400/25 text-pink-300"       },
  gym:               { ar: "صالة رياضية",          icon: "🏋️",  color: "bg-purple-500/15 border-purple-500/25 text-purple-300" },
  cinema_room:       { ar: "غرفة سينما",           icon: "🎬",  color: "bg-indigo-500/15 border-indigo-500/25 text-indigo-300" },
  cinema:            { ar: "سينما خارجية",         icon: "🎬",  color: "bg-indigo-500/15 border-indigo-500/25 text-indigo-300" },
  wifi:              { ar: "واي فاي",              icon: "📶",  color: "bg-sky-500/15 border-sky-500/25 text-sky-300"           },
  ac:                { ar: "تكييف مركزي",          icon: "❄️",  color: "bg-cyan-500/15 border-cyan-500/25 text-cyan-300"       },
  kitchen:           { ar: "مطبخ مجهز",            icon: "🍳",  color: "bg-yellow-500/15 border-yellow-500/25 text-yellow-300" },
  parking:           { ar: "موقف سيارات",          icon: "🅿️",  color: "bg-slate-500/15 border-slate-500/25 text-slate-300"   },
  jacuzzi:           { ar: "جاكوزي",               icon: "🛁",  color: "bg-teal-500/15 border-teal-500/25 text-teal-300"       },
  sauna:             { ar: "ساونا",                icon: "🧖",  color: "bg-red-500/15 border-red-500/25 text-red-300"          },
  private_beach:     { ar: "شاطئ خاص",             icon: "🏖️",  color: "bg-yellow-400/15 border-yellow-400/25 text-yellow-300" },
  security:          { ar: "حراسة أمنية",          icon: "🔒",  color: "bg-slate-500/15 border-slate-500/25 text-slate-300"   },
  generator:         { ar: "مولد كهربائي",         icon: "⚡",  color: "bg-yellow-500/15 border-yellow-500/25 text-yellow-300" },
  laundry:           { ar: "غسالة",                icon: "🫧",  color: "bg-sky-400/15 border-sky-400/25 text-sky-300"          },
  prayer_room:       { ar: "غرفة صلاة",            icon: "🕌",  color: "bg-emerald-400/15 border-emerald-400/25 text-emerald-300" },
  baby_items:        { ar: "مستلزمات أطفال",       icon: "🍼",  color: "bg-pink-400/15 border-pink-400/25 text-pink-300"       },
  fire_pit:          { ar: "موقد نار",              icon: "🪵",  color: "bg-orange-600/15 border-orange-600/25 text-orange-300" },
  pets_allowed:      { ar: "يسمح بالحيوانات",      icon: "🐾",  color: "bg-stone-400/15 border-stone-400/25 text-stone-300"   },
  smart_tv:          { ar: "شاشة ذكية",            icon: "📺",  color: "bg-indigo-400/15 border-indigo-400/25 text-indigo-300" },
  game_room:         { ar: "غرفة ألعاب",           icon: "🎮",  color: "bg-purple-400/15 border-purple-400/25 text-purple-300" },
  other:             { ar: "مرافق إضافية",          icon: "✨",  color: "bg-amber-500/15 border-amber-500/25 text-amber-300"   },
};

/** Legacy Arabic text → info (for data that was stored as Arabic text directly, not as keys) */
const AR_TEXT_LOOKUP: Record<string, AmenityInfo> = {
  "مسبح خاص":      { ar: "مسبح خاص",        icon: "🏊",  color: "bg-blue-500/15 border-blue-500/25 text-blue-300"    },
  "مسبح":           { ar: "مسبح",             icon: "🏊",  color: "bg-blue-500/15 border-blue-500/25 text-blue-300"    },
  "مسبح داخلي":    { ar: "مسبح داخلي",       icon: "🏊",  color: "bg-blue-500/15 border-blue-500/25 text-blue-300"    },
  "مسبح خارجي":    { ar: "مسبح خارجي",       icon: "🌊",  color: "bg-blue-400/15 border-blue-400/25 text-blue-300"    },
  "حديقة":          { ar: "حديقة",            icon: "🌿",  color: "bg-green-500/15 border-green-500/25 text-green-300" },
  "حديقة كبيرة":   { ar: "حديقة كبيرة",      icon: "🌳",  color: "bg-green-400/15 border-green-400/25 text-green-300" },
  "شواء":           { ar: "ركن شواء",         icon: "🔥",  color: "bg-orange-500/15 border-orange-500/25 text-orange-300" },
  "ركن شواء":       { ar: "ركن شواء",         icon: "🔥",  color: "bg-orange-500/15 border-orange-500/25 text-orange-300" },
  "شواء خارجي":     { ar: "شواء خارجي",       icon: "🍖",  color: "bg-orange-400/15 border-orange-400/25 text-orange-300" },
  "واي فاي":        { ar: "واي فاي",          icon: "📶",  color: "bg-sky-500/15 border-sky-500/25 text-sky-300"       },
  "مكيف":           { ar: "تكييف مركزي",      icon: "❄️",  color: "bg-cyan-500/15 border-cyan-500/25 text-cyan-300"    },
  "تكييف مركزي":    { ar: "تكييف مركزي",      icon: "❄️",  color: "bg-cyan-500/15 border-cyan-500/25 text-cyan-300"    },
  "مطبخ مجهز":      { ar: "مطبخ مجهز",        icon: "🍳",  color: "bg-yellow-500/15 border-yellow-500/25 text-yellow-300" },
  "مطبخ":           { ar: "مطبخ مجهز",        icon: "🍳",  color: "bg-yellow-500/15 border-yellow-500/25 text-yellow-300" },
  "موقف سيارات":   { ar: "موقف سيارات",      icon: "🅿️",  color: "bg-slate-500/15 border-slate-500/25 text-slate-300" },
  "موقف":           { ar: "موقف",             icon: "🅿️",  color: "bg-slate-500/15 border-slate-500/25 text-slate-300" },
  "ملعب أطفال":     { ar: "ملعب أطفال",       icon: "🎠",  color: "bg-pink-500/15 border-pink-500/25 text-pink-300"    },
  "العاب أطفال":    { ar: "ألعاب أطفال",       icon: "🎠",  color: "bg-pink-500/15 border-pink-500/25 text-pink-300"    },
  "ألعاب أطفال":    { ar: "ألعاب أطفال",       icon: "🎠",  color: "bg-pink-500/15 border-pink-500/25 text-pink-300"    },
  "ألعاب مائية":    { ar: "ألعاب مائية",       icon: "💦",  color: "bg-sky-500/15 border-sky-500/25 text-sky-300"       },
  "مجالس مستقلة":  { ar: "مجالس مستقلة",     icon: "🛋️",  color: "bg-amber-500/15 border-amber-500/25 text-amber-300" },
  "جاكوزي":         { ar: "جاكوزي",           icon: "🛁",  color: "bg-teal-500/15 border-teal-500/25 text-teal-300"    },
  "صالة رياضية":    { ar: "صالة رياضية",      icon: "🏋️",  color: "bg-purple-500/15 border-purple-500/25 text-purple-300" },
  "ملعب كرة قدم":   { ar: "ملعب كرة قدم",    icon: "⚽",  color: "bg-green-500/15 border-green-500/25 text-green-300"  },
  "ملعب كرة سلة":   { ar: "ملعب كرة سلة",    icon: "🏀",  color: "bg-orange-400/15 border-orange-400/25 text-orange-300" },
  "سينما خارجية":   { ar: "سينما خارجية",    icon: "🎬",  color: "bg-indigo-500/15 border-indigo-500/25 text-indigo-300" },
  "غرفة سينما":     { ar: "غرفة سينما",       icon: "🎬",  color: "bg-indigo-500/15 border-indigo-500/25 text-indigo-300" },
  "بلياردو":        { ar: "بلياردو",          icon: "🎱",  color: "bg-stone-500/15 border-stone-500/25 text-stone-300"  },
  "تنس طاولة":      { ar: "تنس طاولة",        icon: "🏓",  color: "bg-emerald-500/15 border-emerald-500/25 text-emerald-300" },
  "ساونا":          { ar: "ساونا",            icon: "🧖",  color: "bg-red-500/15 border-red-500/25 text-red-300"        },
  "غرفة صلاة":      { ar: "غرفة صلاة",        icon: "🕌",  color: "bg-emerald-400/15 border-emerald-400/25 text-emerald-300" },
  "مولد كهربائي":   { ar: "مولد كهربائي",    icon: "⚡",  color: "bg-yellow-500/15 border-yellow-500/25 text-yellow-300" },
  "غسالة":          { ar: "غسالة",            icon: "🫧",  color: "bg-sky-400/15 border-sky-400/25 text-sky-300"        },
  "شاشة ذكية":      { ar: "شاشة ذكية",        icon: "📺",  color: "bg-indigo-400/15 border-indigo-400/25 text-indigo-300" },
  "غرفة ألعاب":     { ar: "غرفة ألعاب",       icon: "🎮",  color: "bg-purple-400/15 border-purple-400/25 text-purple-300" },
  "حراسة أمنية":    { ar: "حراسة أمنية",      icon: "🔒",  color: "bg-slate-500/15 border-slate-500/25 text-slate-300"  },
  "مستلزمات أطفال": { ar: "مستلزمات أطفال",  icon: "🍼",  color: "bg-pink-400/15 border-pink-400/25 text-pink-300"     },
  "شاطئ خاص":       { ar: "شاطئ خاص",         icon: "🏖️",  color: "bg-yellow-400/15 border-yellow-400/25 text-yellow-300" },
  "موقد نار":        { ar: "موقد نار",          icon: "🪵",  color: "bg-orange-600/15 border-orange-600/25 text-orange-300" },
  "يسمح بالحيوانات":{ ar: "يسمح بالحيوانات", icon: "🐾",  color: "bg-stone-400/15 border-stone-400/25 text-stone-300"  },
};

const DEFAULT_INFO: AmenityInfo = { ar: "مرفق إضافي", icon: "✨", color: "bg-stone-700/50 border-stone-600 text-stone-300" };

/**
 * Resolve a stored amenity key/text to its Arabic display info.
 *
 * Priority order:
 *   1. `other:نص` prefix — strip prefix, show the Arabic text as-is
 *   2. DB catalog (if provided) — labelAr is the source of truth for managed amenities
 *   3. Comprehensive hardcoded fallback map (covers all seed + legacy keys)
 *   4. Legacy Arabic text lookup (old data stored directly as Arabic)
 *   5. Raw Arabic passthrough (any unrecognised Arabic string)
 *   6. Last-resort readable fallback (never shows raw English keys to end users)
 */
export function resolveAmenity(
  raw: string,
  catalog?: Array<{ key: string; labelAr: string }>
): AmenityInfo {
  const trimmed = raw.trim();

  if (!trimmed) return DEFAULT_INFO;

  if (trimmed.startsWith("other:")) {
    const text = trimmed.slice(6).trim();
    return { ar: text || "مرفق مخصص", icon: "✨", color: "bg-amber-500/15 border-amber-500/25 text-amber-300" };
  }

  if (trimmed.includes(":")) {
    const afterColon = trimmed.slice(trimmed.indexOf(":") + 1).trim();
    if (afterColon) return { ar: afterColon, icon: "✨", color: "bg-amber-500/15 border-amber-500/25 text-amber-300" };
  }

  if (catalog) {
    const found = catalog.find((c) => c.key === trimmed);
    if (found) {
      const fb = AMENITY_FALLBACK[trimmed];
      return { ar: found.labelAr, icon: fb?.icon ?? "✨", color: fb?.color ?? DEFAULT_INFO.color };
    }
  }

  if (AMENITY_FALLBACK[trimmed]) return AMENITY_FALLBACK[trimmed];

  if (AR_TEXT_LOOKUP[trimmed]) return AR_TEXT_LOOKUP[trimmed];

  if (/[\u0600-\u06FF]/.test(trimmed)) return { ...DEFAULT_INFO, ar: trimmed };

  const readable = trimmed.replace(/_/g, " ");
  return { ...DEFAULT_INFO, ar: readable };
}
