import assert from "node:assert/strict";
import { it } from "node:test";
import { buildActivitySummaryReportHtml, resolveReportCalendar } from "./financialReport";

it("prioritizes the saved report preference over a stale calendar cache", () => {
  assert.equal(resolveReportCalendar("hijri", "gregorian"), "hijri");
  assert.equal(resolveReportCalendar("gregorian", "hijri"), "gregorian");
  assert.equal(resolveReportCalendar(undefined, "hijri"), "hijri");
  assert.equal(resolveReportCalendar(undefined, "invalid"), "gregorian");
});

it("uses the requested period and activity in both print and PDF summaries, escaping names", () => {
  const base = { title: "التقرير الموحّد", period: "جمادى الأولى ١٤٤٨ هـ", activityName: '<script>نشاط</script>',
    fileName: "تقرير.pdf", rows: [{ label: "إيرادات الخدمات", amount: 1500 }], logo: null, css: "" };
  const pdf = buildActivitySummaryReportHtml({ ...base, forPrint: false });
  const print = buildActivitySummaryReportHtml({ ...base, forPrint: true });
  for (const html of [pdf, print]) {
    assert(html.includes(base.period));
    assert(html.includes("إيرادات الخدمات"));
    assert(html.includes("&lt;script&gt;نشاط&lt;/script&gt;"));
    assert(html.includes((1500).toLocaleString("ar-SA", { maximumFractionDigits: 2 })));
  }
  assert(!pdf.includes("window.print"));
  assert(print.includes("window.print"));
});
