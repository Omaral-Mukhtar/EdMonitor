export interface MathPlotDomain {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface MathPlotCurve {
  id: string;
  orientation: "y_of_x" | "x_of_y";
  expression: string;
  label?: string | null;
  color?: string | null;
  xRange?: [number, number];
  yRange?: [number, number];
}

export interface MathPlotShadedRegion {
  id: string;
  orientation: "dx" | "dy";
  upperExpr: string;
  lowerExpr: string;
  from: number;
  to: number;
  label?: string | null;
  color?: string | null;
}

export interface MathPlotSlice {
  orientation: "dx" | "dy";
  at: number;
  fromExpr: string;
  toExpr: string;
  thicknessPx?: number;
  label?: string | null;
}

export interface MathPlotIntersection {
  x: number;
  y: number;
  label?: string | null;
}

export interface MathPlotAsymptote {
  axis: "x" | "y";
  value: number;
  label?: string | null;
}

export interface MathPlotHole {
  x: number;
  y: number;
  label?: string | null;
}

export interface MathPlotVerticalAsymptote {
  x: number;
  label?: string | null;
}

export interface MathPlotSpec {
  domain: MathPlotDomain;
  curves: MathPlotCurve[];
  shadedRegions?: MathPlotShadedRegion[] | null;
  slices?: MathPlotSlice[] | null;
  intersections?: MathPlotIntersection[] | null;
  asymptotes?: MathPlotAsymptote[] | null;
  holes?: MathPlotHole[] | null;
  verticalAsymptotes?: MathPlotVerticalAsymptote[] | null;
}

export type WhiteboardAiMode = "enhance" | "generate";

export type WhiteboardApiMode =
  | WhiteboardAiMode
  | "explain_topic"
  | "enhance_sketch"
  | "diagnose";

export interface DiagnosticQuestion {
  id: string;
  conceptTag: string;
  question: string;
  options: string[];
}

export interface DiagnosticCheckResponse {
  mode: "diagnose";
  subject: "math";
  topicSummary: string;
  questions: DiagnosticQuestion[];
}

export interface DiagnosticAnswerInput {
  conceptTag: string;
  question: string;
  studentAnswer: string;
}

export interface ConceptGapItem {
  concept: string;
  status: "gap" | "solid";
  note: string;
}

export interface WhiteboardAiStep {
  title: string;
  explanation: string;
  flaggedMistake: string | null;
  svg: string;
  plotSpec: MathPlotSpec | null;
}

export interface WhiteboardAiResponse {
  overlayId: string;
  mode: WhiteboardAiMode | "explain_topic" | "enhance_sketch";
  subject: "math";
  conceptGaps?: ConceptGapItem[];
  steps: WhiteboardAiStep[];
}

export type WhiteboardTool = "pen" | "line" | "rect" | "circle" | "eraser";

export interface VirtualPoint {
  x: number;
  y: number;
}

export interface WhiteboardStroke {
  id: string;
  tool: WhiteboardTool;
  color: string;
  width: number;
  points: VirtualPoint[];
}
