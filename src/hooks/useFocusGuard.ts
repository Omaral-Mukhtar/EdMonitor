"use client";

import { useEffect, useRef, useState } from "react";
import type { ObjectDetection } from "@tensorflow-models/coco-ssd";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import type { CvGuardStatus } from "@/components/room3d/FocusStatusPill";
import type { SharedCameraStatus } from "@/hooks/useSharedMedia";
import {
  createInitialFocusGraceState,
  DEFAULT_DISTRACTION_THRESHOLD_MS,
  stepFocusGrace,
  type FocusGraceState,
} from "@/lib/focus-grace";
import { playDistractionBeep } from "@/lib/web-audio-alert";
import type { DistractionReason, TimerPhase } from "@/types/domain";

const CV_SAMPLE_INTERVAL_MS = 250; // 4 FPS (within 3-5 FPS budget)
const PHONE_CONFIDENCE_THRESHOLD = 0.36;
const MAX_YAW_RATIO = 0.28;
const MAX_DOWN_PITCH_RATIO = 0.36;
const MIN_UP_PITCH_RATIO = -0.24;

let cachedCocoModelPromise: Promise<ObjectDetection> | null = null;
let cachedFaceLandmarkerPromise: Promise<FaceLandmarker> | null = null;

async function loadSelfHostedCocoSsd(): Promise<ObjectDetection> {
  if (!cachedCocoModelPromise) {
    cachedCocoModelPromise = (async () => {
      const tf = await import("@tensorflow/tfjs");
      const cocoSsd = await import("@tensorflow-models/coco-ssd");

      try {
        await tf.setBackend("webgl");
        await tf.ready();
        return await cocoSsd.load({
          base: "lite_mobilenet_v2",
          modelUrl: "/models/coco-ssd/model.json",
        });
      } catch {
        await tf.setBackend("cpu");
        await tf.ready();
        return cocoSsd.load({
          base: "lite_mobilenet_v2",
          modelUrl: "/models/coco-ssd/model.json",
        });
      }
    })().catch((err) => {
      cachedCocoModelPromise = null;
      throw err;
    });
  }
  return cachedCocoModelPromise;
}

async function loadSelfHostedFaceLandmarker(): Promise<FaceLandmarker> {
  if (!cachedFaceLandmarkerPromise) {
    cachedFaceLandmarkerPromise = (async () => {
      const { FilesetResolver, FaceLandmarker } = await import(
        "@mediapipe/tasks-vision"
      );
      const filesetResolver = await FilesetResolver.forVisionTasks(
        "/models/mediapipe/wasm"
      );

      try {
        return await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: "/models/mediapipe/face_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numFaces: 1,
        });
      } catch {
        return FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: "/models/mediapipe/face_landmarker.task",
            delegate: "CPU",
          },
          runningMode: "VIDEO",
          numFaces: 1,
        });
      }
    })().catch((err) => {
      cachedFaceLandmarkerPromise = null;
      throw err;
    });
  }
  return cachedFaceLandmarkerPromise;
}

interface LandmarkPoint {
  x: number;
  y: number;
}

function isHeadTurnedOrLookingAway(landmarks: LandmarkPoint[]): boolean {
  const nose = landmarks[1];
  const forehead = landmarks[10];
  const chin = landmarks[152];
  const leftCheek = landmarks[234];
  const rightCheek = landmarks[454];

  if (!nose || !forehead || !chin || !leftCheek || !rightCheek) {
    return false;
  }

  const faceWidth = Math.abs(rightCheek.x - leftCheek.x);
  const faceHeight = Math.abs(chin.y - forehead.y);
  if (faceWidth < 0.04 || faceHeight < 0.04) {
    return false;
  }

  const centerX = (leftCheek.x + rightCheek.x) / 2;
  const centerY = (forehead.y + chin.y) / 2;

  const yawRatio = Math.abs(nose.x - centerX) / faceWidth;
  const pitchRatio = (nose.y - centerY) / faceHeight;

  return (
    yawRatio > MAX_YAW_RATIO ||
    pitchRatio > MAX_DOWN_PITCH_RATIO ||
    pitchRatio < MIN_UP_PITCH_RATIO
  );
}

interface UseFocusGuardOptions {
  cameraStatus: SharedCameraStatus;
  getVideoElement: () => HTMLVideoElement | null;
  timerPhase: TimerPhase;
  enabled?: boolean;
  onDistractionTriggered: (reason: DistractionReason, durationMs: number) => void;
}

export interface FocusGuardController {
  cvStatus: CvGuardStatus;
  cvErrorMessage: string | null;
  isCvDistracted: boolean;
  lastReason: DistractionReason | null;
}

/**
 * Runs 100% client-side CV inference at ~4 FPS (`setTimeout` loop, never `rAF`)
 * using self-hosted `/models/coco-ssd` + `/models/mediapipe` weights & WASM.
 */
export function useFocusGuard({
  cameraStatus,
  getVideoElement,
  timerPhase,
  enabled = true,
  onDistractionTriggered,
}: UseFocusGuardOptions): FocusGuardController {
  const [modelsReady, setModelsReady] = useState(false);
  const [cvErrorMessage, setCvErrorMessage] = useState<string | null>(null);
  const [isCvDistracted, setIsCvDistracted] = useState(false);
  const [lastReason, setLastReason] = useState<DistractionReason | null>(null);

  const graceStateRef = useRef<FocusGraceState>(createInitialFocusGraceState());
  const timerPhaseRef = useRef<TimerPhase>(timerPhase);
  const onDistractionRef = useRef(onDistractionTriggered);
  const getVideoElementRef = useRef(getVideoElement);
  const cocoRef = useRef<ObjectDetection | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);

  useEffect(() => {
    timerPhaseRef.current = timerPhase;
    if (timerPhase === "break") {
      graceStateRef.current = createInitialFocusGraceState();
    }
  }, [timerPhase]);

  useEffect(() => {
    onDistractionRef.current = onDistractionTriggered;
    getVideoElementRef.current = getVideoElement;
  }, [getVideoElement, onDistractionTriggered]);

  // Preload self-hosted CV models once in background (non-blocking)
  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;
    Promise.all([loadSelfHostedCocoSsd(), loadSelfHostedFaceLandmarker()])
      .then(([cocoModel, faceLandmarker]) => {
        if (cancelled) {
          return;
        }
        cocoRef.current = cocoModel;
        faceLandmarkerRef.current = faceLandmarker;
        setModelsReady(true);
        setCvErrorMessage(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setCvErrorMessage(
            err instanceof Error ? err.message : "Failed to load CV models."
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  // 3-5 FPS bounded setTimeout inference loop (never requestAnimationFrame)
  useEffect(() => {
    if (!enabled || cameraStatus !== "active" || !modelsReady) {
      graceStateRef.current = createInitialFocusGraceState();
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let lastTimestampMs = 0;
    let consecutiveErrors = 0;

    const runIteration = async () => {
      if (cancelled) {
        return;
      }

      const videoEl = getVideoElementRef.current();
      const cocoModel = cocoRef.current;
      const faceLandmarker = faceLandmarkerRef.current;

      if (videoEl && videoEl.paused && videoEl.srcObject) {
        void videoEl.play().catch(() => undefined);
      }

      if (
        videoEl &&
        cocoModel &&
        faceLandmarker &&
        videoEl.readyState >= 2 &&
        videoEl.videoWidth > 0 &&
        videoEl.videoHeight > 0 &&
        !videoEl.paused
      ) {
        try {
          const detections = await cocoModel.detect(
            videoEl,
            10,
            PHONE_CONFIDENCE_THRESHOLD
          );
          if (cancelled) {
            return;
          }
          consecutiveErrors = 0;

          const hasCellPhone = detections.some(
            (item) =>
              item.class === "cell phone" &&
              item.score >= PHONE_CONFIDENCE_THRESHOLD
          );

          let sampleKind: "focused" | "distracted" = "focused";
          let sampleReason: DistractionReason | undefined;

          if (hasCellPhone) {
            sampleKind = "distracted";
            sampleReason = "cell_phone";
          } else {
            const perfNow = Math.max(lastTimestampMs + 1, performance.now());
            lastTimestampMs = perfNow;
            const faceResult = faceLandmarker.detectForVideo(videoEl, perfNow);

            if (!faceResult.faceLandmarks || faceResult.faceLandmarks.length === 0) {
              sampleKind = "distracted";
              sampleReason = "face_absent";
            } else if (isHeadTurnedOrLookingAway(faceResult.faceLandmarks[0])) {
              sampleKind = "distracted";
              sampleReason = "look_away";
            }
          }

          const transition = stepFocusGrace(
            graceStateRef.current,
            {
              kind: sampleKind,
              reason: sampleReason,
              nowMs: Date.now(),
              timerPhase: timerPhaseRef.current,
            },
            { thresholdMs: DEFAULT_DISTRACTION_THRESHOLD_MS }
          );

          graceStateRef.current = transition.state;
          setIsCvDistracted(transition.isDistracted);

          if (transition.shouldTriggerAlert && transition.reason) {
            setLastReason(transition.reason);
            if (timerPhaseRef.current === "focus") {
              playDistractionBeep();
              onDistractionRef.current(
                transition.reason,
                transition.durationMs
              );
            }
          } else if (transition.isDistracted && transition.reason) {
            setLastReason(transition.reason);
          } else if (transition.shouldRecover) {
            setLastReason(null);
          }
        } catch (err: unknown) {
          consecutiveErrors += 1;
          if (consecutiveErrors >= 5) {
            setCvErrorMessage(
              err instanceof Error
                ? err.message
                : "CV inference error on webcam frame."
            );
          }
        }
      }

      if (!cancelled) {
        timeoutId = setTimeout(() => {
          void runIteration();
        }, CV_SAMPLE_INTERVAL_MS);
      }
    };

    timeoutId = setTimeout(() => {
      void runIteration();
    }, CV_SAMPLE_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [cameraStatus, enabled, modelsReady]);

  let cvStatus: CvGuardStatus = "loading";
  if (cameraStatus === "requesting" || cameraStatus === "idle") {
    cvStatus = "requesting";
  } else if (cameraStatus === "error" || cameraStatus === "stopped") {
    cvStatus = "camera_off";
  } else if (cvErrorMessage) {
    cvStatus = "cv_error";
  } else if (modelsReady && cameraStatus === "active") {
    cvStatus = "ready";
  } else {
    cvStatus = "loading";
  }

  const effectiveDistracted =
    enabled &&
    cameraStatus === "active" &&
    modelsReady &&
    timerPhase !== "break" &&
    isCvDistracted;

  return {
    cvStatus,
    cvErrorMessage,
    isCvDistracted: effectiveDistracted,
    lastReason: effectiveDistracted ? lastReason : null,
  };
}
