import DOMPurify from "isomorphic-dompurify";
import type { Config } from "dompurify";

const SVG_FORBID_TAGS = [
  "script",
  "foreignObject",
  "foreignobject",
  "iframe",
  "object",
  "embed",
  "style",
  "animate",
  "animateMotion",
  "animatemotion",
  "animateTransform",
  "animatetransform",
  "set",
  "a",
];

const SVG_FORBID_ATTR = [
  "style",
  "href",
  "xlink:href",
  "onload",
  "onerror",
  "onclick",
  "onmouseover",
  "onmouseenter",
  "onmouseleave",
  "onfocus",
  "onblur",
  "formaction",
  "src",
];

const SVG_SANITIZE_CONFIG: Config = {
  USE_PROFILES: { svg: true, svgFilters: false },
  FORBID_TAGS: SVG_FORBID_TAGS,
  FORBID_ATTR: SVG_FORBID_ATTR,
  ALLOW_DATA_ATTR: false,
  ALLOW_ARIA_ATTR: false,
};

const EXTERNAL_OR_SCRIPT_URL_RE =
  /(javascript:|vbscript:|data:|https?:|\/\/)/i;

function sanitizeSvgWithDomPurify(rawSvg: string): string {
  if (typeof rawSvg !== "string") {
    return "";
  }
  const trimmed = rawSvg.trim();
  if (!trimmed) {
    return "";
  }

  const hook = (_node: Element, data: { attrName: string; attrValue: string; keepAttr: boolean }) => {
    const attrName = data.attrName.toLowerCase();
    if (attrName.startsWith("on") || attrName === "href" || attrName === "xlink:href" || attrName === "style") {
      data.keepAttr = false;
      return;
    }
    if (EXTERNAL_OR_SCRIPT_URL_RE.test(data.attrValue)) {
      data.keepAttr = false;
    }
  };

  DOMPurify.addHook("uponSanitizeAttribute", hook);
  try {
    const cleaned = DOMPurify.sanitize(trimmed, SVG_SANITIZE_CONFIG);
    if (typeof cleaned !== "string") {
      return "";
    }
    const result = cleaned.trim();
    if (!result.toLowerCase().includes("<svg")) {
      return "";
    }
    return result;
  } finally {
    DOMPurify.removeHook("uponSanitizeAttribute");
  }
}

/**
 * Server-side SVG sanitizer invoked in `POST /api/ai/whiteboard` before returning AI output.
 */
export function sanitizeSvgServer(rawSvg: string): string {
  return sanitizeSvgWithDomPurify(rawSvg);
}

/**
 * Client-side SVG sanitizer invoked in `SvgOverlayLayer` right before DOM injection.
 */
export function sanitizeSvgClient(rawSvg: string): string {
  return sanitizeSvgWithDomPurify(rawSvg);
}

const SVG_DRAWABLE_ELEMENT_RE =
  /<(path|line|rect|circle|ellipse|polygon|polyline|text)\b/i;

/**
 * Returns true if the sanitized SVG string contains at least one visible drawable primitive.
 */
export function hasSvgDrawableContent(svg: string): boolean {
  return SVG_DRAWABLE_ELEMENT_RE.test(svg);
}
