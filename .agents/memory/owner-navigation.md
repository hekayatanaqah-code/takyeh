---
name: Owner navigation
description: Direct owner dashboard entry and account-wide toolbar controls.
---

There must be no independent intermediate Hub page. A service owner enters the active service's dashboard directly. The greeting with the owner's name and the controls for adding an activity/service, subscriptions/plans, personal settings, and registration requests belong at the top of the real dashboard as a flexible toolbar.

**Why:** The user explicitly replaced the earlier separate-Hub requirement with direct service-dashboard entry and an integrated toolbar.

**How to apply:** Prefer an active service for ordinary default entry, but preserve an explicitly selected owned service across reloads and browser navigation. Keep activity switching inside the dashboard and settings, subscriptions, and registration requests account-wide. Preserve property-only, staff, and administrator-impersonation management paths. Reuse existing subscription capacity checks when adding activities. Use a single account-wide requests action labeled «متابعة الطلبات».

The entire owner dashboard must keep the platform's primary header above the owner's greeting box: platform logo/name and one “الرئيسية / تصفح المنصة” control. The greeting box below it contains account actions only. For owners with an added activity, property/service management and “الشؤون الإدارية والمالية” are distinct primary sections below the greeting, not mixed among account actions. Do not repeat those primary choices elsewhere or duplicate the platform-home link inside the greeting. Do not show separate “اختر الخدمة التي تريد إدارتها” cards above an already displayed activity. The shared “العقار/النشاط الحالي” area above the tab navigation is a static name/icon card for exactly one property or service, without an arrow or “جميع الأنشطة”. With multiple activities it becomes a dropdown including “جميع الأنشطة” and internal “العقارات” / “الخدمات” groups.

**Why:** After consolidating navigation, the user explicitly requested separating the major management sections from simple account controls while preserving the branded platform header and direct section transitions.

**How to apply:** Keep the selected activity's identity and activation status in its actual dashboard. Preserve important expiry alerts and access to subscriptions rather than removing those capabilities along with redundant banners.

Account buttons inside the greeting should share one horizontal row on wide screens or a balanced responsive grid on narrower screens. Prioritize comfortable, clearly readable text over fitting every control into one dense row.

**Why:** The user asked for larger, very clear text and independent management sections, superseding the earlier combined account-and-management row.

**How to apply:** Keep equal-height account controls with legible text, and give primary section navigation its own prominent treatment. Preserve permissions, activity choices, and all existing actions.

عند الضغط على بطاقة «الشؤون الإدارية والمالية» وهي تحمل عدد إشعارات، يُفتح تبويب «الإشعارات» الفرعي مباشرةً.

**Why:** المستخدم طلب هذا التوجيه صراحةً ضمن تحسين تجربة لوحة تحكم المالك، مع الحفاظ على المنطق التشغيلي الحالي.

**How to apply:** اجعل الضغط على البطاقة هو سبب التوجيه؛ لا تحوّل المستخدم تلقائياً بعيداً عن تبويبه أثناء وصول إشعارات جديدة، ولا تفرض تبويب الإشعارات عندما لا تحمل البطاقة تنبيهات.

عند عدم إضافة أي عقار أو خدمة، تبقى خيارات الحساب العلوية فقط وتُخفى أقسام الإدارة والتبويبات كلها. تعرض المساحة الوسطى بطاقة «لا توجد عقارات أو خدمات مضافة بعد» وزر «+ أضف عقارك أو خدمتك الأولى الآن»، داخل لوحة المالك نفسها لا في صفحة Hub منفصلة.

**Why:** المستخدم طلب واجهة بسيطة للحساب الخالي من الأنشطة، مع إبقاء إضافة النشاط والباقات والإعدادات ومتابعة الطلبات متاحة.

**How to apply:** طلب إضافة محفوظ، ولو كان مسودة أو قيد المراجعة، ليس حساباً لم يضف شيئاً. لا تعرض هذه الحالة أثناء التحميل أو عند فشل تحميل الأنشطة، ولا توسّعها إلى مسارات الموظفين أو معاينة الإدارة. استخدم مسار الإضافة الحالي وفحوص السعة والاشتراك، مع اختيار نوع النشاط أولاً للحسابات التي تدعم النوعين.

تبويبات إدارة العقارات المتقدمة والشؤون الإدارية والمالية للعقارات لا تظهر ولا تُفعّل إلا عند وجود عقار مقبول ونشط واحد على الأقل. إذا كانت الطلبات قيد المراجعة أو مرفوضة أو تتطلب تعديلاً فقط، تبقى الواجهة البسيطة، وتتاح بطاقات الطلبات بحالاتها وأسبابها في «متابعة الطلبات».

**Why:** المستخدم طلب تقييد الأقسام التشغيلية، لا إخفاء الطلبات غير المقبولة أو اعتبار حساب المالك خالياً من الأنشطة.

**How to apply:** تحقّق من قبول الطلب ونشاط العقار المرتبط معاً، لأن سجلاً منشوراً تاريخياً لا يثبت استمرار القبول. احمِ عرض محتوى التبويب ومسار الشؤون المالية، لا الأزرار وحدها، عند فقدان الأهلية. أبقِ إدارة الخدمات المستقلة منفصلة عن شرط أهلية العقارات.

«إدارة عقاراتي» تعرض العقارات المقبولة فقط. «متابعة الطلبات» تعرض الطلبات قيد المراجعة والمرفوضة والتي تتطلب تعديلاً فقط، والزر العلوي يفتح هذه القائمة فعلياً. القائمتان منفصلتان، وليستا نسختين من كل الطلبات.

**Why:** المستخدم طلب فصل البيانات واستبعاد الحالات غير المقبولة من قائمة إدارة العقارات نهائياً، لا حذف سجلاتها.

**How to apply:** انتقال حالة الطلب إلى مقبول ينقله إلى الإدارة ويزيله من المتابعة. احتفظ بسبب الإدارة وإجراء تعديل الطلب في قائمة المتابعة، ووجّه الرجوع بعد إرسال الطلب إليها. للحساب المختلط، افتح طلبات العقارات عند الضغط من إدارة العقارات بدلاً من التحويل تلقائياً إلى طلبات الخدمات.

The activity selector governs property/service calendars, seasons, financial views and notifications across section changes. “جميع الأنشطة” is an intentional combined view, never an implicit choice of the first property or service. Keep account settings and registration requests account-wide.

**Why:** The user explicitly adopted a single multi-activity dashboard scope, replacing independent per-tab selections.

**How to apply:** Retain activity selection across navigation/reload and reconcile removed activities without exposing a different activity under the old label. Preserve provider-linked service components when rendering grouped activity views.

Property-management subscriptions retain property-management tabs. Financial/administrative management stays visible as a locked navigation item when the plan lacks it; clicking opens an upgrade card rather than hiding the section or silently granting access.

**Why:** The user explicitly requested an understandable upgrade path without restricting the property tools included in the current plan.

**How to apply:** Use current subscription scope and activity status, fail closed while checking financial entitlement, preserve free/trial grants, and retain server-side financial checks. Route upgrade choices through the existing subscription flow, never initiate payment from the lock.