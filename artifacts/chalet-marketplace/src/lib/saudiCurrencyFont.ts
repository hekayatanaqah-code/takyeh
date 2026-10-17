import { saudiMoneyMessage } from "./saudiCurrency";

// Same single SVG-derived glyph as the UI font, embedded for portable previews/print.
export const SAUDI_RIYAL_FONT_CSS = `@font-face{font-family:'Saudi Riyal Symbol';src:url(data:font/woff2;base64,d09GMgABAAAAAAIEAAoAAAAAA6gAAAG5AAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAABmAANAqBMIExATYCJAMGCwYABCAFgXkHLhvrAgAuB2xjE2ZP0phBbhDUQB5uv4VcO/cZRLQfv9l790VNqhiimsiErCHRtUJAO/+q7rqu8wyjQIJABrIR7Ca8CQ024JzzwAYbjCe5lcDGApWTb6IUfud/j8HEzbQEOh8Tc1uL1nmAY2O2vQsjbON68KcXfKAHeXOXXdvwEzaUfCnfjpFfyoMJLUEoYJ4L/r94uv4XtQE5BYY/gQo2gLMhka75A63LLA4YeyBrfUgDBZJBHQDQAEDVyC0Zuv0l2nvf45J+o5n9Ll7/FNzJIueXyfet2wwWnDVwJnntRyqc6/SPI8OlXr/5JR/EXvJ75vqR6vPL14M2U6ZOnzZfVkEHf5kVOVXNcU8v+X4efrvPfE2Fc70uKb42r9K5DgAECCZbdmefXfa/Es0B+Hl3eC3bcA4wGRgUAMH2mSavB3AwgCg0sf4EZBOgJFMAFPp3S7sEgHAEAkAx40gAGOx5EADazzC1rRkkWSCCRbRxxVYNbvDXVdbQTWGs2y8R/8aJjYHpPy9LD2AJIpDI52gyYMWwCf4aTdgwgDV/MDfMGDRnGh4xZqU/YHGUokXtqE7shASzldmJxPiiBAAA) format('woff2');font-weight:100 900;unicode-range:U+20C1;font-display:swap;}`;

export function saudiCurrencyHtml(html: string): string {
  const formatted = saudiMoneyMessage(html).replace(
    /font-family:([ \t]*)([^;}\n]+)/gi,
    (rule, _space, family: string) => family.includes("Saudi Riyal Symbol")
      ? rule : `font-family:'Saudi Riyal Symbol',${family}`,
  );
  return /<style(?:\s[^>]*)?>/i.test(formatted)
    ? formatted.replace(/<style(?:\s[^>]*)?>/i, match => `${match}${SAUDI_RIYAL_FONT_CSS}`)
    : `<style>${SAUDI_RIYAL_FONT_CSS}</style>${formatted}`;
}
