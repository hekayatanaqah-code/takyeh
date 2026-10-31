import React from "react";

export type ServiceReportDetailTable = {
  title: string; headers: string[]; rows: string[][]; emptyMessage?: string;
};

export type ServiceReportAmountRow = { label: string; amount: number };

function Amount({ value }: { value: number }) {
  return <span className="financial-report-number"><bdi dir="ltr">{value < 0 ? "-" : ""}{Math.abs(value).toLocaleString("ar-SA", {
    minimumFractionDigits: 2, maximumFractionDigits: 2, numberingSystem: "arab",
  })}</bdi> ر.س</span>;
}

export function ServiceFinancialReportPanels({ rows, details, closingRows }: {
  rows: ServiceReportAmountRow[]; details: ServiceReportDetailTable[]; closingRows: ServiceReportAmountRow[];
}) {
  return <div className="space-y-5" data-testid="service-report-content">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="service-report-summary">
      {rows.map(row => <div key={row.label} className="rounded-2xl border border-border bg-card p-4 text-center">
        <p className="mb-2 text-sm font-semibold leading-6 text-foreground">{row.label}</p>
        <p className={`text-2xl font-bold ${row.amount < 0 || row.label.startsWith("المصروفات") ? "text-destructive" : row.label.startsWith("صافي") || row.label.startsWith("إجمالي") ? "text-green-600" : "text-foreground"}`}>
          <Amount value={row.amount} />
        </p>
      </div>)}
    </div>
    <p className="rounded-xl border border-border bg-muted/30 p-4 text-base font-medium leading-8 text-foreground">
      الإيرادات هي المبالغ المحصلة فعليًا؛ العربون جزء منها وليس إيرادًا إضافيًا. القيمة التعاقدية تشمل غير المسدد.
      التأمين القابل للاسترداد منفصل عن الإيرادات وعن المتبقي لأصل الخدمة.
      تُخصم مصروفات الخدمة المسجلة خلال الفترة كاملة من إيرادات النطاق المختار؛ لا تُوزّع المصروفات تلقائيًا بين الحجوزات والبيع السريع.
    </p>
    {details.map(section => <section key={section.title} className="space-y-3 rounded-2xl border border-border bg-card p-4" data-testid="service-report-details">
      <h3 className="font-bold">{section.title}</h3>
      {section.rows.length ? <div className="overflow-x-auto">
        <table className="w-full text-right text-xs"><thead><tr>{section.headers.map(header => <th key={header} className="p-2">{header}</th>)}</tr></thead>
          <tbody>{section.rows.map((row, index) => <tr key={index} className="border-t border-border">{row.map((cell, column) => <td key={column} className="p-2">{cell}</td>)}</tr>)}</tbody>
        </table>
      </div> : <p className="text-sm text-muted-foreground">{section.emptyMessage || "لا توجد سجلات خلال الفترة المختارة."}</p>}
    </section>)}
    <section className="space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-4" data-testid="service-report-closing">
      <h3 className="font-bold">الحسابات الختامية</h3>
      {closingRows.map(row => <div key={row.label} className={`flex flex-wrap items-center justify-between gap-2 ${row.label.startsWith("صافي") ? "border-t border-border pt-3 text-lg font-bold" : "text-sm"}`}>
        <span>{row.label}</span><span className={row.amount < 0 ? "text-destructive" : ""}><Amount value={row.amount} /></span>
      </div>)}
    </section>
  </div>;
}
