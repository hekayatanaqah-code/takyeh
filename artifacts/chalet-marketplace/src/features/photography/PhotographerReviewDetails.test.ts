import assert from "node:assert/strict";
import { it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import type { Photographer } from "./shared";

it("renders saved photographer details on fresh loads and handles legacy or unsafe values", async () => {
  const server = await createServer({
    configFile: false,
    resolve: { alias: { "@": fileURLToPath(new URL("../../", import.meta.url)) } },
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true },
    appType: "custom",
    esbuild: { jsx: "automatic" },
  });
  try {
    const { PhotographerReviewDetails } = await server.ssrLoadModule("/src/features/photography/PhotographerReviewDetails.tsx");
    // Use the same serialized fields a fresh admin GET returns, not portal form state.
    const saved = JSON.stringify({
      id: 7, name: "مصور تجريبي", experienceYears: "3_5",
      portfolioUrl: "https://example.com/portfolio?x=1",
      profileImagePath: "/objects/uploads/test.webp",
    });
    const render = (p: Partial<Photographer>) => renderToStaticMarkup(React.createElement(PhotographerReviewDetails, { p }));
    for (let load = 0; load < 2; load++) {
      const html = render(JSON.parse(saved));
      assert.match(html, /٣-٥ سنوات/);
      assert.match(html, /href="https:\/\/example.com\/portfolio\?x=1"/);
      assert.match(html, /target="_blank" rel="noopener noreferrer"/);
      assert.match(html, /src="\/api\/storage\/objects\/uploads\/test.webp"/);
      assert.match(html, /alt="الصورة الشخصية للمصور مصور تجريبي"/);
    }
    for (const [value, label] of [["under_1", "أقل من سنة"], ["1_3", "١-٣ سنوات"], ["over_5", "أكثر من ٥ سنوات"]]) {
      assert.ok(render({ experienceYears: value as Photographer["experienceYears"] }).includes(label));
    }
    const legacy = render({ id: 8 });
    for (const label of ["غير مسجلة", "لم تُرفق صورة شخصية", "لم يُضف رابط معرض أعمال"]) assert.ok(legacy.includes(label));
    assert.doesNotMatch(legacy, /<a |<img /);
    for (const url of ["javascript:alert(1)", "data:text/html,test", "//example.com", "not a url"]) {
      const html = render({ portfolioUrl: url });
      assert.match(html, /رابط معرض الأعمال غير صالح/);
      assert.doesNotMatch(html, /<a /);
    }
    assert.match(render({ portfolioUrl: "http://example.com" }), /href="http:\/\/example.com\/"/);
  } finally {
    await server.close();
  }
});
