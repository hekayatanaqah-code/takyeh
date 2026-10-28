---
name: Service booking cards
description: User-required parity with property cards and safe boundaries for additive service collections.
---

Service bookings use the property bookings' card presentation in both the booking register and day details: customer/contact/service details, a colored bottom financial strip, and horizontally arranged quick actions.

**Why:** The user explicitly requested replacing the traditional service-booking text table with cards matching property bookings exactly.

**How to apply:** Preserve visual parity without mounting property-only data or mutations. Keep the previously approved service time picker intact and keep editing/rescheduling unified under «تعديل».

The service booking register is ordered by service date, not record-creation date, and limited to ten cards per page with previous/next/numbered navigation. Quick actions occupy two balanced rows with every applicable action visible, without horizontal scrolling.

**Why:** The user explicitly requested these constraints to keep large booking registers from becoming excessively long and card actions from becoming crowded.

**How to apply:** Reset pagination when changing service or status filters, and keep the selected page valid after deletions. The user replaced the earlier single-line scrolling requirement with two visible rows. Adapt the column count to the applicable actions, allow button labels to wrap within their cells, and never hide actions behind horizontal scrolling.

Additional collections use the existing booking's payment method and custody classification; do not silently introduce mixed payment methods or partial bank-deposit accounting.

**Why:** This request changes presentation and adds a quick collection action, not a new per-installment financial ledger. Reclassifying all prior money to match a new payment would corrupt the accepted balances.

**How to apply:** Explain the classification before confirmation, including that new cash marked deposited must already be in the bank. Addition must reject stale payment snapshots, duplicate concurrent submissions, cancelled bookings, and amounts beyond the remaining balance. Expand mixed-method accounting only as separately requested work.

«التأمين المسترد المطبق» في إنشاء حجز الخدمة وتعديله قابل للتحرير اليدوي. إعداد الخدمة يحدد القيمة الافتراضية فقط؛ يجوز للمالك تعديلها أو مسحها/إدخال صفر لإعفاء هذا الحجز وحده.

**Why:** المستخدم طلب أن يكون التأمين افتراضياً قابلاً للتجاوز لكل عميل، لا قفلاً إلزامياً من إعداد الخدمة.

**How to apply:** لا تعِد تطبيق الافتراضي بعد أن يحرر المالك الحقل، ولا تستبدل القيمة المحفوظة عند تحرير حجز قديم. ميّز غياب القيمة في طلب الإنشاء عن صفر صريح، واحفظ المسح كصفر دون تعديل إعداد النشاط.
