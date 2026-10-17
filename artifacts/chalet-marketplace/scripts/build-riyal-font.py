"""Build a single-glyph font from the supplied SVG, without changing its artwork.

The SVG is used directly by RiyalIcon; this glyph covers text, input placeholders,
charts and self-contained print layouts that cannot contain a React component.
Requires fonttools and brotli (development only).
"""
from pathlib import Path
import xml.etree.ElementTree as ET
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path

root = Path(__file__).resolve().parents[1]
svg = ET.parse(root / "src/assets/saudi-riyal.svg").getroot()
pen = TTGlyphPen(None)
curves = Cu2QuPen(pen, max_err=0.5, reverse_direction=True)
scale = 1400 / 1256.39
transformed = TransformPen(curves, (scale, 0, 0, -scale, 60, 1500))
for node in svg.iter("{http://www.w3.org/2000/svg}path"):
    parse_path(node.attrib["d"], transformed)

builder = FontBuilder(2048, isTTF=True)
builder.setupGlyphOrder([".notdef", "uni20C1"])
builder.setupCharacterMap({0x20C1: "uni20C1"})
builder.setupGlyf({".notdef": TTGlyphPen(None).glyph(), "uni20C1": pen.glyph()})
builder.setupHorizontalMetrics({".notdef": (1450, 0), "uni20C1": (1450, 60)})
builder.setupHorizontalHeader(ascent=1650, descent=-398)
builder.setupNameTable({
    "familyName": "Saudi Riyal Symbol",
    "styleName": "Regular",
    "uniqueFontIdentifier": "SaudiRiyalSymbol",
    "fullName": "Saudi Riyal Symbol",
    "psName": "SaudiRiyalSymbol",
})
builder.setupOS2(sTypoAscender=1650, sTypoDescender=-398, usWinAscent=1650, usWinDescent=398)
builder.setupPost()
builder.font.flavor = "woff2"
builder.font.save(root / "src/assets/saudi-riyal.woff2")
