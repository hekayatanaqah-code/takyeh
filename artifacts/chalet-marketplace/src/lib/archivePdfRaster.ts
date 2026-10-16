/**
 * Render the self-contained report at its own origin, independently of RTL dashboard scroll.
 * Serializing html2canvas's document clone instead can crop wide tables on narrow viewports.
 */
export async function rasterizeArchivePage(element: HTMLElement, width: number, height: number): Promise<HTMLCanvasElement> {
  const scale = 1.75;
  const page = element.cloneNode(true) as HTMLElement;
  Object.assign(page.style, {
    width: `${width}px`, height: `${height}px`, margin: "0", position: "static",
    transform: "none", opacity: "1", visibility: "visible",
  });
  page.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const content = document.createElementNS(ns, "foreignObject");
  content.setAttribute("width", "100%");
  content.setAttribute("height", "100%");
  content.appendChild(page);
  svg.appendChild(content);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("المتصفح لا يدعم إنشاء تقرير PDF.");
  try {
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
    await image.decode();
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    // Accessing pixels detects browsers that disallow SVG foreignObject canvas capture.
    context.getImageData(0, 0, 1, 1);
    return canvas;
  } catch (error) {
    // Older browsers retain the compatible renderer, with zero letter spacing to preserve Arabic.
    console.warn("[archive PDF] Native Arabic rendering unavailable; using compatible renderer.", error);
    canvas.width = canvas.height = 0;
    const { default: html2canvas } = await import("html2canvas");
    return html2canvas(element, {
      scale, backgroundColor: "#ffffff", logging: false, windowWidth: width + 80,
    });
  }
}
