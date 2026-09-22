with open('/tmp/new_owners.tsx', 'w', encoding='utf-8') as f:
    f.write('''function OwnersTab({ isSuperAdmin = false }: { isSuperAdmin?: boolean }) {
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const [mainTab, setMainTab]             = useState<"property" | "service" | "both">("property");
  const [search, setSearch]               = useState("");
  const [cityFilter, setCityFilter]       = useState("");
  const [districtFilter, setDistrictFilter] = useState("");
  const [propertyCatFilter, setPropertyCatFilter] = useState("all");
  const [serviceCatFilter, setServiceCatFilter]   = useState("all");
  const [page, setPage]                   = useState(1);
  const [selected, setSelected]           = useState<Set<string>>(new Set());
  const [archiveOwner, setArchiveOwner]   = useState<{ id: string; name: string } | null>(null);
  const [deleteOwnerTarget, setDeleteOwnerTarget] = useState<{ id: string; name: string } | null>(null);
  const qc = useQueryClient();

  /* ── Fetch owners ── */
  const { data: owners = [], isLoading } = useQuery({
    queryKey: ["admin", "owners"],
    queryFn: async () => {
      const r = await apiFetch("/admin/owners");
      if (!r.ok) throw new Error("فشل التحميل");
      return r.json() as Promise<Owner[]>;
    },
  });

  /* ── Fetch catalogs ── */
  const { data: citiesCatalog = [] } = useQuery({
    queryKey: ["admin", "cities"],
    queryFn: async () => {
      const r = await apiFetch("/admin/cities");
      if (!r.ok) return [];
      return r.json() as Promise<{ id: number; name: string }[]>;
    },
  });

  const { data: allDistricts = [] } = useQuery({
    queryKey: ["admin", "districts"],
    queryFn: async () => {
      const r = await apiFetch("/admin/districts");
      if (!r.ok) return [];
      return r.json() as Promise<{ id: number; name: string; cityId: number }[]>;
    },
  });

  const { data: propertiesCats = [] } = useQuery<{id:number;nameAr:string;isActive:boolean}[]>({
    queryKey: ["admin", "categories"],
    queryFn: async () => {
      const r = await apiFetch("/admin/categories");
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: serviceCats = [] } = useQuery<{id:number;key:string;labelAr:string;isActive:boolean}[]>({
    queryKey: ["admin", "service-categories"],
    queryFn: async () => {
      const r = await apiFetch("/admin/service-categories");
      if (!r.ok) return [];
      return r.json();
    },
  });

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [mainTab, search, cityFilter, districtFilter, propertyCatFilter, serviceCatFilter]);

  // Reset district when city changes
  useEffect(() => { setDistrictFilter(""); }, [cityFilter]);

  const availableDistricts = useMemo(() => {
    if (!cityFilter) return [];
    const city = citiesCatalog.find((c) => c.name === cityFilter);
    if (!city) return [];
    return allDistricts.filter((d) => d.cityId === city.id);
  }, [cityFilter, citiesCatalog, allDistricts]);

  // Base list by main tab
  const baseOwners = useMemo(() => {
    return owners.filter(o => {
      if (o.ownerKind === 'none') return false;
      if (mainTab === 'property') return o.ownerKind === 'property';
      if (mainTab === 'service') return o.ownerKind === 'service';
      return o.ownerKind === 'both' && o.propertyCount > 0 && o.serviceCount > 0;
    });
  }, [owners, mainTab]);

  const dynamicPropertyCats = useMemo(() => {
    return propertiesCats.map(cat => {
      const count = baseOwners.filter(o => o.propertyCategories?.some(c => c.name === cat.nameAr)).length;
      return { ...cat, count };
    }).filter(c => c.count > 0);
  }, [propertiesCats, baseOwners]);

  const dynamicServiceCats = useMemo(() => {
    return serviceCats.map(cat => {
      const count = baseOwners.filter(o => o.serviceCategories?.some(c => c.name === cat.key || c.name === cat.labelAr)).length;
      return { ...cat, count };
    }).filter(c => c.count > 0);
  }, [serviceCats, baseOwners]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return baseOwners.filter(o => {
      if (q && !o.ownerName.toLowerCase().includes(q) && !o.whatsappNumber.includes(q)) return false;
      if (cityFilter && o.location !== cityFilter) return false;
      if (districtFilter && (o.district ?? "") !== districtFilter) return false;

      if (mainTab === 'property' && propertyCatFilter !== 'all') {
        if (!o.propertyCategories?.some(c => c.name === propertyCatFilter)) return false;
      }
      if (mainTab === 'service' && serviceCatFilter !== 'all') {
        if (!o.serviceCategories?.some(c => c.name === serviceCatFilter || c.name === serviceCats.find(sc => sc.key === serviceCatFilter)?.labelAr)) return false;
      }
      return true;
    });
  }, [baseOwners, search, cityFilter, districtFilter, mainTab, propertyCatFilter, serviceCatFilter, serviceCats]);

  const pageSize = 15;
  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const allSelectedOnPage = paginated.length > 0 && paginated.every((o) => selected.has(o.ownerId));
  const hasFilters  = search || cityFilter || districtFilter || (mainTab === 'property' && propertyCatFilter !== 'all') || (mainTab === 'service' && serviceCatFilter !== 'all');

  const toggleAllOnPage = () => {
    const newSel = new Set(selected);
    if (allSelectedOnPage) {
      paginated.forEach((o) => newSel.delete(o.ownerId));
    } else {
      paginated.forEach((o) => newSel.add(o.ownerId));
    }
    setSelected(newSel);
  };
  const toggleOne = (id: string) => {
    const newSel = new Set(selected);
    if (newSel.has(id)) newSel.delete(id);
    else newSel.add(id);
    setSelected(newSel);
  };

  const { toast } = useToast();
  const softDeleteOwner = useMutation({
    mutationFn: async ({ id, adminNote }: { id: string; adminNote?: string }) => {
      const r = await apiFetch(`/admin/owners/${id}/soft-delete`, {
        method: "POST",
        body: JSON.stringify({ adminNote }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || "فشل الحذف");
      }
    },
    onSuccess: () => {
      toast({ title: "تم الحذف", description: "تم حذف المالك وأرشفة بياناته بنجاح" });
      setDeleteOwnerTarget(null);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["admin", "owners"] });
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const impersonate = useMutation({
    mutationFn: async (ownerId: string) => {
      setImpersonating(ownerId);
      const r = await apiFetch("/admin/impersonate", {
        method: "POST",
        body: JSON.stringify({ ownerId }),
      });
      if (!r.ok) {
        setImpersonating(null);
        throw new Error("فشل تسجيل الدخول");
      }
      window.location.href = `${BASE}/dashboard`;
    },
    onError: (e: Error) => alert(e.message),
  });

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-slate-400 w-8 h-8" /></div>;
  }

  const colSpan = isSuperAdmin ? 6 : 5;

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">إدارة الملاك</h2>
          <p className="text-slate-400 text-sm mt-1">
            {owners.length > 0 ? `${toAr(owners.length)} مالك إجمالي` : "لا يوجد ملاك بعد"}
            {selected.size > 0 && <span className="mr-2 text-amber-400">— {toAr(selected.size)} محدّد</span>}
          </p>
        </div>
        {isSuperAdmin && (
          <span className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-3 py-1.5 rounded-full font-semibold">
            مشرف عام فقط
          </span>
        )}
      </div>

      {/* ── Main Tabs ── */}
      <div className="flex gap-2 border-b border-slate-700 pb-2">
        <button
          onClick={() => setMainTab("property")}
          className={`px-4 py-2 font-bold text-sm rounded-t-lg transition-colors border-b-2 ${
            mainTab === "property"
              ? "text-amber-400 border-amber-400 bg-amber-500/5"
              : "text-slate-400 border-transparent hover:text-white"
          }`}
        >
          ملاك العقارات
          <span className="mr-1.5 text-xs bg-slate-800 px-1.5 py-0.5 rounded-full text-slate-300">
            {toAr(owners.filter(o => o.ownerKind === 'property').length)}
          </span>
        </button>
        <button
          onClick={() => setMainTab("service")}
          className={`px-4 py-2 font-bold text-sm rounded-t-lg transition-colors border-b-2 ${
            mainTab === "service"
              ? "text-amber-400 border-amber-400 bg-amber-500/5"
              : "text-slate-400 border-transparent hover:text-white"
          }`}
        >
          ملاك الخدمات
          <span className="mr-1.5 text-xs bg-slate-800 px-1.5 py-0.5 rounded-full text-slate-300">
            {toAr(owners.filter(o => o.ownerKind === 'service').length)}
          </span>
        </button>
        <button
          onClick={() => setMainTab("both")}
          className={`px-4 py-2 font-bold text-sm rounded-t-lg transition-colors border-b-2 ${
            mainTab === "both"
              ? "text-amber-400 border-amber-400 bg-amber-500/5"
              : "text-slate-400 border-transparent hover:text-white"
          }`}
        >
          ملاك مشتركون
          <span className="mr-1.5 text-xs bg-slate-800 px-1.5 py-0.5 rounded-full text-slate-300">
            {toAr(owners.filter(o => o.ownerKind === 'both' && o.propertyCount > 0 && o.serviceCount > 0).length)}
          </span>
        </button>
      </div>

      {/* ── Sub-categories (Dynamic) ── */}
      {mainTab === "property" && dynamicPropertyCats.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setPropertyCatFilter("all")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors border ${
              propertyCatFilter === "all"
                ? "bg-slate-700 text-white border-slate-500"
                : "bg-slate-800/50 text-slate-400 border-slate-700 hover:bg-slate-800 hover:text-white"
            }`}
          >
            كل العقارات
          </button>
          {dynamicPropertyCats.map(cat => (
            <button
              key={cat.id}
              onClick={() => setPropertyCatFilter(cat.nameAr)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors border ${
                propertyCatFilter === cat.nameAr
                  ? "bg-slate-700 text-white border-slate-500"
                  : "bg-slate-800/50 text-slate-400 border-slate-700 hover:bg-slate-800 hover:text-white"
              }`}
            >
              {cat.nameAr}
              <span className="mr-1 text-[10px] opacity-60">({toAr(cat.count)})</span>
            </button>
          ))}
        </div>
      )}

      {mainTab === "service" && dynamicServiceCats.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setServiceCatFilter("all")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors border ${
              serviceCatFilter === "all"
                ? "bg-slate-700 text-white border-slate-500"
                : "bg-slate-800/50 text-slate-400 border-slate-700 hover:bg-slate-800 hover:text-white"
            }`}
          >
            كل الخدمات
          </button>
          {dynamicServiceCats.map(cat => (
            <button
              key={cat.id}
              onClick={() => setServiceCatFilter(cat.key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors border ${
                serviceCatFilter === cat.key
                  ? "bg-slate-700 text-white border-slate-500"
                  : "bg-slate-800/50 text-slate-400 border-slate-700 hover:bg-slate-800 hover:text-white"
              }`}
            >
              {cat.labelAr}
              <span className="mr-1 text-[10px] opacity-60">({toAr(cat.count)})</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Filter bar ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-800/60 rounded-lg border border-slate-700">
        <div className="relative sm:col-span-1">
          <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو الجوال..."
            className="w-full bg-slate-900 border border-slate-600 rounded-lg text-sm text-white pr-9 pl-3 py-2 placeholder:text-slate-500 focus:outline-none focus:border-amber-500/60"
          />
        </div>
        <select
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          className="bg-slate-900 border border-slate-600 rounded-lg text-sm text-slate-200 px-3 py-2 focus:outline-none focus:border-amber-500/60"
        >
          <option value="">كل المدن</option>
          {citiesCatalog.map((c) => (
            <option key={c.id} value={c.name}>{c.name}</option>
          ))}
        </select>
        <select
          value={districtFilter}
          onChange={(e) => setDistrictFilter(e.target.value)}
          disabled={!cityFilter || availableDistricts.length === 0}
          className="bg-slate-900 border border-slate-600 rounded-lg text-sm text-slate-200 px-3 py-2 focus:outline-none focus:border-amber-500/60 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <option value="">
            {!cityFilter ? "اختر المدينة أولاً" : availableDistricts.length === 0 ? "لا توجد أحياء" : "كل الأحياء"}
          </option>
          {availableDistricts.map((d) => (
            <option key={d.id} value={d.name}>{d.name}</option>
          ))}
        </select>
      </div>

      {/* Active filter summary */}
      {hasFilters && (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>الفلاتر النشطة:</span>
          {mainTab === 'property' && propertyCatFilter !== 'all' && <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full">{propertyCatFilter}</span>}
          {mainTab === 'service' && serviceCatFilter !== 'all' && <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full">{serviceCats.find(c => c.key === serviceCatFilter)?.labelAr || serviceCatFilter}</span>}
          {cityFilter && <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full">{cityFilter}</span>}
          {districtFilter && <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full">{districtFilter}</span>}
          {search && <span className="bg-slate-700 px-2 py-0.5 rounded-full">"{search}"</span>}
          <button
            onClick={() => { setSearch(""); setCityFilter(""); setDistrictFilter(""); setPropertyCatFilter("all"); setServiceCatFilter("all"); }}
            className="mr-auto text-slate-500 hover:text-white transition-colors"
          >
            مسح الكل
          </button>
        </div>
      )}

      {/* Results count & Pagination controls top */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          عرض <span className="text-white font-semibold">{toAr(paginated.length)}</span> من <span className="text-white font-semibold">{toAr(filtered.length)}</span> نتائج
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-2 text-sm">
            <Button
              variant="outline" size="sm" className="h-8 border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
              onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            >
              السابق
            </Button>
            <span className="text-slate-400 text-xs">
              صفحة {toAr(page)} من {toAr(totalPages)}
            </span>
            <Button
              variant="outline" size="sm" className="h-8 border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            >
              التالي
            </Button>
          </div>
        )}
      </div>

      {/* ── Table ── */}
      <div className="rounded-lg border border-slate-700 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-700 bg-slate-800">
              <TableHead className="w-10 text-center">
                <input type="checkbox" checked={allSelectedOnPage} onChange={toggleAllOnPage}
                  className="w-4 h-4 rounded accent-amber-400 cursor-pointer" />
              </TableHead>
              <TableHead className="text-slate-300 text-right font-semibold">اسم المالك</TableHead>
              {mainTab === 'property' && <TableHead className="text-slate-300 text-right font-semibold">العقارات ({toAr(baseOwners.reduce((s,o)=>s+o.propertyCount,0))})</TableHead>}
              {mainTab === 'service' && <TableHead className="text-slate-300 text-right font-semibold">الخدمات ({toAr(baseOwners.reduce((s,o)=>s+o.serviceCount,0))})</TableHead>}
              {mainTab === 'both' && <TableHead className="text-slate-300 text-right font-semibold">النشاط (عقار + خدمة)</TableHead>}
              <TableHead className="text-slate-300 text-right font-semibold">الجوال / واتساب</TableHead>
              <TableHead className="text-slate-300 text-right font-semibold">التسجيل / الاشتراك</TableHead>
              <TableHead className="text-slate-300 text-right font-semibold">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.length === 0 && (
              <TableRow>
                <TableCell colSpan={colSpan} className="text-center py-14">
                  <div className="flex flex-col items-center gap-2 text-slate-400">
                    <svg className="w-8 h-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" /></svg>
                    <p>{owners.length === 0 ? "لا يوجد ملاك مسجلون بعد" : "لا توجد نتائج تطابق الفلاتر"}</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {paginated.map((owner) => (
              <TableRow
                key={owner.ownerId}
                className={`border-slate-700 transition-colors ${selected.has(owner.ownerId) ? "bg-amber-500/5" : "hover:bg-slate-800/50"}`}
              >
                <TableCell className="text-center">
                  <input type="checkbox" checked={selected.has(owner.ownerId)} onChange={() => toggleOne(owner.ownerId)}
                    className="w-4 h-4 rounded accent-amber-400 cursor-pointer" />
                </TableCell>

                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-white font-medium text-sm">{owner.ownerName}</span>
                    <span className="font-mono text-[10px] text-slate-500 max-w-[160px] truncate cursor-default" title={owner.ownerId}>
                      {owner.ownerId}
                    </span>
                  </div>
                </TableCell>

                <TableCell>
                  {mainTab === 'property' && (
                    <>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-slate-200 text-sm font-semibold">{toAr(owner.propertyCount)} عقار</span>
                        <span className="text-slate-400 text-xs truncate max-w-[150px]">{owner.primaryProperty || "—"}</span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {owner.propertyCategories.map((c, i) => (
                          <span key={i} className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded whitespace-nowrap">
                            {c.name} {c.count > 1 ? `(${toAr(c.count)})` : ""}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                  {mainTab === 'service' && (
                    <>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-slate-200 text-sm font-semibold">{toAr(owner.serviceCount)} خدمة</span>
                        <span className="text-slate-400 text-xs truncate max-w-[150px]">{owner.primaryService || "—"}</span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {owner.serviceCategories.map((c, i) => (
                          <span key={i} className="text-[10px] bg-indigo-900/40 text-indigo-300 border border-indigo-700/50 px-1.5 py-0.5 rounded whitespace-nowrap">
                            {c.name} {c.count > 1 ? `(${toAr(c.count)})` : ""}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                  {mainTab === 'both' && (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-200 text-xs bg-slate-700 px-1.5 py-0.5 rounded">{toAr(owner.propertyCount)} عقار</span>
                        <span className="text-slate-400 text-[10px] truncate max-w-[120px]">{owner.primaryProperty}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-indigo-200 text-xs bg-indigo-900/40 border border-indigo-700/50 px-1.5 py-0.5 rounded">{toAr(owner.serviceCount)} خدمة</span>
                        <span className="text-slate-400 text-[10px] truncate max-w-[120px]">{owner.primaryService}</span>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-1 mt-1.5">
                    {owner.location && <span className="text-slate-500 text-[10px]">{owner.location}</span>}
                    {owner.location && owner.district && <span className="text-slate-600 text-[10px]">←</span>}
                    {owner.district && <span className="text-slate-500 text-[10px]">{owner.district}</span>}
                  </div>
                </TableCell>

                <TableCell>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-slate-300 font-mono text-sm ltr text-right">{toAr(owner.whatsappNumber)}</span>
                    <a href={`https://wa.me/${owner.whatsappNumber}`} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] text-green-400 hover:text-green-300 flex items-center gap-1 w-fit bg-green-500/10 px-1.5 py-0.5 rounded">
                      مراسلة واتساب
                    </a>
                  </div>
                </TableCell>

                <TableCell>
                  <div className="flex flex-col gap-1">
                    <span className="text-slate-400 text-xs flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-600"></span>
                      منذ {fmtDate(owner.createdAt)}
                    </span>
                    <span className="text-slate-400 text-xs flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        owner.subscriptionStatus === "active" ? "bg-green-500" :
                        owner.subscriptionStatus === "trial" ? "bg-amber-500" : "bg-red-500"
                      }`}></span>
                      {owner.subscriptionStatus === "active" ? "اشتراك نشط" :
                       owner.subscriptionStatus === "trial" ? "فترة تجريبية" :
                       owner.subscriptionStatus === "expired" ? "منتهي" : "غير محدد"}
                    </span>
                  </div>
                </TableCell>

                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setArchiveOwner({ id: owner.ownerId, name: owner.ownerName })}
                      className="h-8 text-xs text-slate-400 hover:text-amber-400 hover:bg-slate-700" title="المراسلات والدعم">
                      <Inbox className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteOwnerTarget({ id: owner.ownerId, name: owner.ownerName })}
                      className="h-8 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/20" title="حذف الأرشفة">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => impersonate.mutate(owner.ownerId)} disabled={impersonating === owner.ownerId}
                      className="h-8 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-900/20" title="دخول كمالك">
                      {impersonating === owner.ownerId ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm pt-2">
          <Button
            variant="outline" size="sm" className="h-8 border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
            onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
          >
            السابق
          </Button>
          <span className="text-slate-400 text-xs px-2">
            صفحة {toAr(page)} من {toAr(totalPages)}
          </span>
          <Button
            variant="outline" size="sm" className="h-8 border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
          >
            التالي
          </Button>
        </div>
      )}

      {deleteOwnerTarget && (
        <SoftDeleteOwnerModal
          ownerName={deleteOwnerTarget.name}
          open={true}
          onClose={() => setDeleteOwnerTarget(null)}
          onConfirm={(reason) => softDeleteOwner.mutate({ id: deleteOwnerTarget.id, adminNote: reason })}
          isLoading={softDeleteOwner.isPending}
        />
      )}

      {archiveOwner && (
        <Dialog open={true} onOpenChange={() => setArchiveOwner(null)}>
          <DialogContent className="max-w-4xl bg-slate-900 border-slate-700 h-[85vh] flex flex-col p-0 overflow-y-auto" dir="rtl">
            <DialogHeader className="p-4 border-b border-slate-800">
              <DialogTitle className="flex items-center gap-2 text-slate-100">
                <Inbox className="w-5 h-5 text-amber-400" />
                أرشيف المراسلات — {archiveOwner.name}
              </DialogTitle>
            </DialogHeader>
            <div className="p-4 flex-1">
              <OwnerInboxTab ownerIdFilter={archiveOwner.id} />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
''')
