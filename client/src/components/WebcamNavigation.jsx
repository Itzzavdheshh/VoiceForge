import React, { useEffect, useRef, useState } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { loadAccessibilitySettings } from "../utils/accessibilitySettings";

export default function WebcamNavigation({ enabled }) {
  const videoRef = useRef(null);
  const cursorRef = useRef(null);
  const progressRef = useRef(null);
  const requestRef = useRef(null);
  const faceLandmarkerRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);

  // Dwell state
  const hoveredElementRef = useRef(null);
  const hoverStartTimeRef = useRef(0);
  const dwellTimeRef = useRef(1500);

  // Setup the video and landmarker when enabled changes
  useEffect(() => {
    if (!enabled) {
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }
      if (faceLandmarkerRef.current) {
        faceLandmarkerRef.current.close();
        faceLandmarkerRef.current = null;
      }
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      if (cursorRef.current) {
        cursorRef.current.style.display = "none";
      }
      return;
    }

    let isMounted = true;

    // Load settings
    const settings = loadAccessibilitySettings();
    dwellTimeRef.current = settings.dwellTime || 1500;

    // Event listener for settings changes (optional, but good if changed in another tab)
    const handleStorageChange = (e) => {
      if (e.key === "voiceforge:accessibilitySettings") {
        const newSettings = loadAccessibilitySettings();
        dwellTimeRef.current = newSettings.dwellTime || 1500;
      }
    };
    window.addEventListener("storage", handleStorageChange);

    // Initialize MediaPipe and Webcam
    async function init() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
        );
        
        faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
            delegate: "GPU"
          },
          outputFaceBlendshapes: false,
          runningMode: "VIDEO",
          numFaces: 1
        });

        if (!isMounted) return;

        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
        if (!isMounted) return;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.addEventListener("loadeddata", predictWebcam);
        }
      } catch (err) {
        console.error("Webcam Navigation Init Error:", err);
      }
    }

    init();

    return () => {
      isMounted = false;
      window.removeEventListener("storage", handleStorageChange);
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }
      if (faceLandmarkerRef.current) {
        faceLandmarkerRef.current.close();
        faceLandmarkerRef.current = null;
      }
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [enabled]);

  // Main processing loop
  const predictWebcam = () => {
    if (!videoRef.current || !faceLandmarkerRef.current || !enabled) return;

    let startTimeMs = performance.now();
    if (lastVideoTimeRef.current !== videoRef.current.currentTime) {
      lastVideoTimeRef.current = videoRef.current.currentTime;
      const results = faceLandmarkerRef.current.detectForVideo(videoRef.current, startTimeMs);
      
      if (results.faceLandmarks && results.faceLandmarks.length > 0) {
        // Nose tip is landmark 4
        const noseTip = results.faceLandmarks[0][4];
        
        // Map to screen coordinates. Mirror the X axis.
        // Sensitivity multipliers to map smaller head movements to full screen.
        const sensitivity = 2.0;
        
        // Centered around 0.5
        let mappedX = 0.5 - (noseTip.x - 0.5) * sensitivity;
        let mappedY = 0.5 + (noseTip.y - 0.5) * sensitivity;
        
        // Clamp to [0, 1]
        mappedX = Math.max(0, Math.min(1, mappedX));
        mappedY = Math.max(0, Math.min(1, mappedY));

        const screenX = mappedX * window.innerWidth;
        const screenY = mappedY * window.innerHeight;

        updateCursor(screenX, screenY);
      } else {
        // No face found, hide cursor
        if (cursorRef.current) cursorRef.current.style.display = "none";
      }
    }
    
    if (enabled) {
      requestRef.current = requestAnimationFrame(predictWebcam);
    }
  };

  const updateCursor = (x, y) => {
    if (!cursorRef.current) return;
    
    cursorRef.current.style.display = "block";
    cursorRef.current.style.left = `${x}px`;
    cursorRef.current.style.top = `${y}px`;

    // Dwell logic
    // Hide cursor temporarily to find the element underneath
    cursorRef.current.style.pointerEvents = "none";
    const el = document.elementFromPoint(x, y);
    cursorRef.current.style.pointerEvents = "auto"; // restore if needed, usually we keep it none

    // Check if element is clickable
    const isClickable = el && (
      el.tagName === 'BUTTON' || 
      el.tagName === 'A' || 
      el.tagName === 'INPUT' || 
      el.getAttribute('role') === 'button' ||
      el.onclick != null ||
      el.closest('button') != null ||
      el.closest('a') != null
    );

    const now = performance.now();

    if (isClickable) {
      // Find the actual clickable target (e.g. if hovering on an icon inside a button)
      const targetEl = el.closest('button') || el.closest('a') || el;
      
      if (hoveredElementRef.current === targetEl) {
        // Still hovering the same element
        const elapsed = now - hoverStartTimeRef.current;
        const progress = Math.min(1, elapsed / dwellTimeRef.current);
        
        updateProgressRing(progress);

        if (elapsed >= dwellTimeRef.current) {
          // Trigger click
          targetEl.click();
          // Reset hover state so we don't continuously click
          hoveredElementRef.current = null;
          updateProgressRing(0);
          
          // Provide visual feedback for click (optional)
          cursorRef.current.classList.add("webcam-click-feedback");
          setTimeout(() => {
            if (cursorRef.current) cursorRef.current.classList.remove("webcam-click-feedback");
          }, 300);
        }
      } else {
        // New clickable element
        hoveredElementRef.current = targetEl;
        hoverStartTimeRef.current = now;
        updateProgressRing(0);
      }
    } else {
      // Not clickable
      hoveredElementRef.current = null;
      updateProgressRing(0);
    }
  };

  const updateProgressRing = (progress) => {
    if (!progressRef.current) return;
    // Circular path length is 2 * pi * r. For r=20, length is ~125.6
    const circumference = 125.6;
    const offset = circumference - (progress * circumference);
    progressRef.current.style.strokeDashoffset = offset;
    
    // Change opacity based on progress
    if (progress > 0) {
      progressRef.current.style.opacity = "1";
    } else {
      progressRef.current.style.opacity = "0";
    }
  };

  if (!enabled) return null;

  return (
    <>
      <video
        ref={videoRef}
        className="sr-only"
        playsInline
        muted
        autoPlay
      />
      <div
        ref={cursorRef}
        className="webcam-cursor"
        style={{ display: "none", pointerEvents: "none" }}
      >
        <div className="webcam-cursor-dot" />
        <svg className="webcam-cursor-ring" width="50" height="50">
          <circle
            ref={progressRef}
            className="webcam-cursor-progress"
            cx="25"
            cy="25"
            r="20"
          />
        </svg>
      </div>
    </>
  );
}
