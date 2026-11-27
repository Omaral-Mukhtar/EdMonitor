import { describe, expect, it } from "vitest";
import {
  hasSvgDrawableContent,
  sanitizeSvgClient,
  sanitizeSvgServer,
} from "@/lib/ai/sanitizeSvg";

describe("sanitizeSvgServer & sanitizeSvgClient (double SVG sanitization)", () => {
  it("strips <script>, <foreignObject>, <iframe>, <object>, <embed>, and <style> tags", () => {
    const malicious = `<svg viewBox="0 0 1200 800" xmlns="http://www.w3.org/2000/svg">
      <path d="M 10 10 L 100 100" stroke="#2563EB" stroke-width="3" fill="none" />
      <script>alert("xss")</script>
      <foreignObject width="100" height="100"><div>html</div></foreignObject>
      <style>path { fill: url(https://evil.test); }</style>
      <iframe src="https://evil.test"></iframe>
      <object data="https://evil.test"></object>
      <embed src="https://evil.test" />
    </svg>`;

    const serverClean = sanitizeSvgServer(malicious);
    const clientClean = sanitizeSvgClient(serverClean);

    for (const out of [serverClean, clientClean]) {
      expect(out.toLowerCase()).not.toContain("<script");
      expect(out.toLowerCase()).not.toContain("<foreignobject");
      expect(out.toLowerCase()).not.toContain("<iframe");
      expect(out.toLowerCase()).not.toContain("<object");
      expect(out.toLowerCase()).not.toContain("<embed");
      expect(out.toLowerCase()).not.toContain("<style");
      expect(out).toContain("<path");
      expect(out).toContain('viewBox="0 0 1200 800"');
      expect(out).toContain('d="M 10 10 L 100 100"');
      expect(hasSvgDrawableContent(out)).toBe(true);
    }
  });

  it("strips onload, onclick, onerror, and javascript: / external href attributes", () => {
    const malicious = `<svg viewBox="0 0 1200 800" onload="alert(1)" xmlns="http://www.w3.org/2000/svg">
      <a xlink:href="javascript:alert(2)" href="https://evil.test">
        <rect x="10" y="10" width="50" height="50" onclick="steal()" onmouseover="steal()" fill="#2563EB" />
      </a>
      <circle cx="200" cy="200" r="20" onerror="alert(3)" fill="#16A34A" />
    </svg>`;

    const serverClean = sanitizeSvgServer(malicious);
    const clientClean = sanitizeSvgClient(serverClean);

    for (const out of [serverClean, clientClean]) {
      expect(out.toLowerCase()).not.toContain("onload");
      expect(out.toLowerCase()).not.toContain("onclick");
      expect(out.toLowerCase()).not.toContain("onmouseover");
      expect(out.toLowerCase()).not.toContain("onerror");
      expect(out.toLowerCase()).not.toContain("javascript:");
      expect(out.toLowerCase()).not.toContain("https://evil.test");
      expect(out).toContain("<circle");
    }
  });

  it("preserves clean 1200x800 math diagram primitives and detects empty SVG", () => {
    const clean = `<svg viewBox="0 0 1200 800" xmlns="http://www.w3.org/2000/svg">
      <g>
        <line x1="100" y1="700" x2="1100" y2="700" stroke="#0F172A" stroke-width="2" />
        <text x="600" y="120" fill="#2563EB">A = 4/3</text>
      </g>
    </svg>`;

    const doubleCleaned = sanitizeSvgClient(sanitizeSvgServer(clean));
    expect(doubleCleaned).toContain("<line");
    expect(doubleCleaned).toContain("A = 4/3");
    expect(hasSvgDrawableContent(doubleCleaned)).toBe(true);

    const empty = sanitizeSvgServer(
      '<svg viewBox="0 0 1200 800" xmlns="http://www.w3.org/2000/svg"></svg>'
    );
    expect(hasSvgDrawableContent(empty)).toBe(false);
  });
});
