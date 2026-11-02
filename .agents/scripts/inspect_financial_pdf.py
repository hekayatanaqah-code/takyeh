"""Render actual app downloads; never generate replacement report PDFs.

Optional QA dependency: install PyMuPDF through the package-management tools
before running this script. It is not an application runtime dependency.
"""
import json
from pathlib import Path

import pymupdf as fitz

ROOT = Path(__file__).resolve().parents[2]
INPUT = ROOT / "generated-artifacts/launch-fix-audit"
OUTPUT = INPUT / "pdf-pages"
OUTPUT.mkdir(parents=True, exist_ok=True)
results = []
for source in sorted(INPUT.glob("*-actual.pdf")):
    raw = source.read_bytes()
    if not raw.startswith(b"%PDF") or len(raw) < 1000:
        raise ValueError(f"Invalid PDF download: {source.name}")
    doc = fitz.open(source)
    pages = []
    for index, page in enumerate(doc):
        image = OUTPUT / f"{source.stem}-page-{index + 1}.png"
        page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False).save(image)
        text = page.get_text()
        pages.append({
            "number": index + 1,
            "widthPoints": round(page.rect.width, 2),
            "heightPoints": round(page.rect.height, 2),
            "renderedImage": str(image.relative_to(ROOT)),
            "extractableTextCharacters": len(text),
            "embeddedImageCount": len(page.get_images()),
        })
    results.append({"file": source.name, "bytes": len(raw), "pageCount": len(doc), "pages": pages})
    doc.close()
destination = INPUT / "pdf-structure-verification.json"
destination.write_text(json.dumps(results, ensure_ascii=False, indent=2))
print(json.dumps(results, ensure_ascii=False, indent=2) if results else "Waiting for actual app PDF downloads.")
