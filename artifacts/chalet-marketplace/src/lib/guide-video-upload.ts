/** Keep signed URLs and provider response bodies out of user-visible errors. */
export function uploadFailure(status: number, responseText: string, requestId?: string | null): Error {
  let detail = "";
  try {
    const body = JSON.parse(responseText);
    detail = [body.code, body.error].filter(value => typeof value === "string")
      .map(value => value.replace(/https?:\/\/\S+/g, "[رابط محجوب]").slice(0, 200)).join(" — ");
  } catch {
    // Storage providers can return XML; never display their signed request details.
    detail = responseText.match(/<Code>([A-Za-z0-9_]+)<\/Code>/)?.[1] ?? "";
  }
  const fallback: Record<number, string> = {
    403: "رابط الرفع منتهي أو غير مصرح به",
    413: "حجم الملف يتجاوز حد الخادم أو بوابة الاتصال",
    415: "نوع الفيديو غير مدعوم",
    408: "انتهت مهلة استقبال الفيديو",
    507: "لا توجد مساحة تخزين كافية",
    502: "تعذر اتصال بوابة الاستضافة بالخادم",
    504: "انتهت مهلة بوابة الاستضافة",
  };
  const reference = requestId && /^[\w.-]{1,100}$/.test(requestId) ? `؛ مرجع: ${requestId}` : "";
  return new Error(`تعذر رفع الفيديو (HTTP ${status}) — ${detail || fallback[status] || "فشل طلب الرفع إلى التخزين"}${reference}`);
}

/** XHR provides actual byte-upload progress; fetch currently does not. */
export function uploadGuideFile(
  url: string, file: File, onProgress: (percent: number) => void,
  createRequest: () => XMLHttpRequest = () => new XMLHttpRequest(),
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = createRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
    xhr.timeout = 30 * 60_000;
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) onProgress(Math.min(100, Math.round(event.loaded * 100 / event.total)));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) { onProgress(100); resolve(); }
      else reject(uploadFailure(xhr.status, xhr.responseText, xhr.getResponseHeader("x-request-id")));
    };
    xhr.onerror = () => reject(new Error("تعذر الاتصال بخادم التخزين (UPLOAD_NETWORK_ERROR). تحقق من الاتصال وإعدادات السماح بالرفع."));
    xhr.ontimeout = () => reject(new Error("انتهت مهلة رفع الفيديو (UPLOAD_TIMEOUT). حاول عبر اتصال أسرع."));
    xhr.onabort = () => reject(new Error("أُلغي رفع الفيديو (UPLOAD_ABORTED)."));
    onProgress(0);
    xhr.send(file);
  });
}
