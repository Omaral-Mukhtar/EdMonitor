import type { MathPlotDomain } from "@/types/whiteboard";

export interface MathSyllabusTopic {
  id: string;
  course: string;
  title: string;
  status: "active" | "todo";
  allowedFormulas: string[];
  forbiddenMethods: string[];
  requiredStepOrder: string[];
  defaultDomain?: MathPlotDomain;
  examplePrompts: string[];
}

export const DEFAULT_MATH_TOPIC_ID = "math2-area-between-curves";

export const MATH_SYLLABUS_TOPICS: readonly MathSyllabusTopic[] = [
  {
    id: "math2-area-between-curves",
    course: "Math 2",
    title: "Area Between Curves (dx / dy)",
    status: "active",
    allowedFormulas: [
      "Vertical slice area: A = integral_a^b [f_top(x) - f_bottom(x)] dx",
      "Horizontal slice area: A = integral_c^d [g_right(y) - g_left(y)] dy",
      "Splitting integrals at crossing points where bounding curves swap: integral_a^c + integral_c^b",
      "Standard power, trigonometric, exponential, and logarithmic antiderivatives (x^n, sin(x), cos(x), e^x, 1/x -> ln|x|)",
    ],
    forbiddenMethods: [
      "Double or iterated multivariable integrals (double integral over R dA)",
      "Green's theorem or line integrals",
      "Polar area formulas (1/2 integral r^2 dtheta)",
      "Numerical Riemann, trapezoidal, or Simpson approximations when exact symbolic integration applies",
    ],
    requiredStepOrder: [
      "Sketch curves & identify bounding equations",
      "Solve intersections to find integration limits",
      "Select dx (top - bottom) or dy (right - left) slice and split at any crossing",
      "Set up definite integral(s) and evaluate exact area",
    ],
    defaultDomain: { xMin: -2, xMax: 4, yMin: -1, yMax: 5 },
    examplePrompts: [
      "Find the area enclosed by y = x^2 and y = 2x",
      "Find the area between y = x^3 and y = x on [-1, 1]",
      "Find the area bounded by x = y^2 and x = y + 2",
    ],
  },
  {
    id: "math1-limits",
    course: "Math 1",
    title: "Limits & Continuity",
    status: "active",
    allowedFormulas: [
      "Direct substitution: if f(x) is continuous at a, lim_{x->a} f(x) = f(a)",
      "Algebraic factoring and canceling common factors for 0/0 indeterminate forms",
      "Rationalizing numerators or denominators using conjugates",
      "One-sided limits (x -> a^- and x -> a^+); two-sided limit exists iff both are finite and equal",
      "Vertical and horizontal asymptote behavior (e.g., 1/(x - a) -> +-infinity, end behavior as x -> +-infinity)",
      "Standard trigonometric limit: lim_{x->0} sin(x)/x = 1",
    ],
    forbiddenMethods: [
      "L'Hopital's rule (differentiating numerator and denominator)",
      "Derivatives, power rule differentiation, or Taylor/Maclaurin series expansions",
    ],
    requiredStepOrder: [
      "Test direct substitution to identify an indeterminate form (0/0) or undefined point",
      "Algebraically simplify (factor/cancel or conjugate) or evaluate left-hand and right-hand limits",
      "State the exact limit value (or DNE) and whether a removable hole or vertical asymptote exists",
    ],
    defaultDomain: { xMin: -3, xMax: 5, yMin: -4, yMax: 6 },
    examplePrompts: [
      "Find lim as x -> 1 of (x^2 - 1) / (x - 1)",
      "Analyze lim as x -> 2 of 1 / (x - 2)",
    ],
  },
  {
    id: "math1-derivatives-tangent",
    course: "Math 1",
    title: "Derivatives & Tangent Lines (TODO)",
    status: "todo",
    // TODO: Populate exact Math 1 Derivatives & Tangent Lines syllabus rules.
    allowedFormulas: [
      "TODO: Power, product, quotient, and chain rules; point-slope tangent line y - f(a) = f'(a)(x - a)",
    ],
    forbiddenMethods: [
      "TODO: Multivariable partial derivatives or Taylor series approximations",
    ],
    requiredStepOrder: [
      "TODO: Sketch curve and point of tangency",
      "TODO: Compute derivative f'(x) and slope at x = a",
      "TODO: Write and plot tangent line equation",
    ],
    defaultDomain: { xMin: -3, xMax: 3, yMin: -2, yMax: 6 },
    examplePrompts: ["Find and plot the tangent line to y = x^2 at x = 1"],
  },
  {
    id: "math2-volumes-disk-washer",
    course: "Math 2",
    title: "Volumes: Disk, Washer & Shells (TODO)",
    status: "todo",
    // TODO: Populate exact Math 2 Volumes syllabus rules.
    allowedFormulas: [
      "TODO: Disk/Washer pi * integral (R^2 - r^2) dx and Cylindrical Shells 2*pi * integral r*h dx",
    ],
    forbiddenMethods: [
      "TODO: Triple integrals in cylindrical or spherical coordinates",
    ],
    requiredStepOrder: [
      "TODO: Sketch 2D cross-section and axis of revolution",
      "TODO: Identify outer/inner radii or shell radius/height",
      "TODO: Set up and evaluate exact volume integral",
    ],
    defaultDomain: { xMin: -1, xMax: 4, yMin: -1, yMax: 4 },
    examplePrompts: ["Explain washer method setup for region between y = x and y = x^2 around y = 0"],
  },
  {
    id: "math2-integration-techniques",
    course: "Math 2",
    title: "Integration Techniques (TODO)",
    status: "todo",
    // TODO: Populate exact Math 2 Integration Techniques syllabus rules.
    allowedFormulas: [
      "TODO: u-substitution, integration by parts, trig identities, and partial fractions",
    ],
    forbiddenMethods: [
      "TODO: Contour integration or numerical CAS-only black-box evaluation",
    ],
    requiredStepOrder: [
      "TODO: Classify integrand structure",
      "TODO: Apply substitution or by-parts decomposition",
      "TODO: Simplify and verify by differentiation",
    ],
    defaultDomain: { xMin: -2, xMax: 4, yMin: -2, yMax: 4 },
    examplePrompts: ["Show step-by-step setup for integral of x * e^x"],
  },
  {
    id: "linear-algebra-systems-transform",
    course: "Linear Algebra",
    title: "Linear Systems & 2D Transforms (TODO)",
    status: "todo",
    // TODO: Populate exact Linear Algebra syllabus rules.
    allowedFormulas: [
      "TODO: Gaussian elimination, linear combinations, and 2x2 matrix transforms on basis vectors",
    ],
    forbiddenMethods: [
      "TODO: Tensor calculus or infinite-dimensional operator theory",
    ],
    requiredStepOrder: [
      "TODO: Write system or transformation equations",
      "TODO: Plot geometric lines/vectors and intersection or image",
      "TODO: Solve and interpret solution space",
    ],
    defaultDomain: { xMin: -4, xMax: 4, yMin: -4, yMax: 4 },
    examplePrompts: ["Plot intersection of y = 2*x - 1 and y = -x + 5"],
  },
] as const;

export function getDefaultMathTopicForRoom(roomSlug?: string | null): string {
  switch (roomSlug) {
    case "math-calculus":
      return "math1-limits";
    case "math-2-integrals":
      return "math2-area-between-curves";
    default:
      return DEFAULT_MATH_TOPIC_ID;
  }
}

export function getMathSyllabusTopic(
  topicId?: string | null
): MathSyllabusTopic {
  if (topicId) {
    const found = MATH_SYLLABUS_TOPICS.find((t) => t.id === topicId);
    if (found) {
      return found;
    }
  }
  return MATH_SYLLABUS_TOPICS[0];
}

export function formatSyllabusForPrompt(topic: MathSyllabusTopic): string {
  return JSON.stringify(
    {
      topicId: topic.id,
      course: topic.course,
      title: topic.title,
      status: topic.status,
      allowedFormulas: topic.allowedFormulas,
      forbiddenMethods: topic.forbiddenMethods,
      requiredStepOrder: topic.requiredStepOrder,
    },
    null,
    2
  );
}
