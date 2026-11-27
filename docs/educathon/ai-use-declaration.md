# AI Educathon 2026 — AI-Use Declaration

| AI tool and version | Task performed | How output was verified | Precautions (data, bias, copyright) |
| :--- | :--- | :--- | :--- |
| Google Gemini (gemini-3.8-flash primary and gemini-3.5-flash-lite fallback) | Math-only solo whiteboard tutor generating step-by-step explanations, sketch mistake feedback, and structured graph data for accurate plotting. | Verified through strict output schema checks, safe math expression checks, double diagram sanitization, automated route tests, and live testing on calculus problems. | Requires verified-email login, rate limits requests per user, limits whiteboard sketch size, sends no personal data, treats user prompts as untrusted input, and enforces course syllabus rules for math only. |
| TensorFlow.js coco-ssd (2.2.3) and MediaPipe Face Landmarker (1.2.3, stored locally in the app) | On-device webcam focus monitoring detecting phone use, desk absence, and prolonged look-aways with a 3-second grace window and break exemption. | Verified through focus-grace unit tests, live webcam testing, and browser network checks confirming zero external model requests. | Runs 100% on the user's device with zero video frames uploaded or saved, offers an optional camera toggle with manual timer fallback, and uses Apache-2.0 licensed open-source models. |
| Gemini 4 Hydrogen High and Neon High | Planning, interface and code drafting, test writing, and debugging support during development. | Verified through automated test suites, type and quality checks, production builds, and manual multi-account browser and hardware testing. | No personal or confidential data entered, demo accounts use fictional identities only, and all generated outputs and open-source licenses were reviewed by the team. |

We confirm that no personal or confidential data were entered into AI tools and that demo data are fictional or anonymized.

Team name: Cherry

Signatures:
- ______________________
- ______________________
