import { useState, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import Callout from "../Callout/Callout";

const CALLOUT_GAP = 16;

const SpotlightOverlay = ({
  targetRef,
  calloutText,
  calloutActionText = "Got it",
  calloutPosition = "left",
  onDismiss,
}) => {
  // Every way out calls onDismiss (and the callers save "seen" for each): the callout's "Got it",
  // Escape, a click anywhere outside the spotlighted target, and a click on the target itself.
  const [targetRect, setTargetRect] = useState(null);

  const updateRect = useCallback(() => {
    if (targetRef.current) {
      setTargetRect(targetRef.current.getBoundingClientRect());
    }
  }, [targetRef]);

  useEffect(() => {
    const timer = setTimeout(() => {
      requestAnimationFrame(updateRect);
    }, 100);

    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [updateRect]);

  useEffect(() => {
    // Gated on targetRect: if the target never shows up (e.g. the page it points at is still
    // loading when this mounts), the component renders nothing below and must never lock scroll
    // for an overlay no one can see or dismiss — that left body scroll stuck once already.
    if (!targetRect) return undefined;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [targetRect, onDismiss]);

  // A click on the spotlighted target dismisses the tip and still reaches the target: the overlay
  // leaves a hole over it (see the four panels below) and this listener only observes the click in
  // the capture phase, never stopping it, so "Mark as applied" or a download button works first time.
  useEffect(() => {
    const target = targetRef.current;
    if (!targetRect || !target) return undefined;
    target.addEventListener("click", onDismiss, true);
    return () => target.removeEventListener("click", onDismiss, true);
  }, [targetRect, targetRef, onDismiss]);

  if (!targetRect) return null;

  const pointerMap = {
    left: "right",
    right: "left",
    top: "bottom",
    bottom: "top",
  };

  const calloutStyle = (() => {
    switch (calloutPosition) {
      case "left":
        return {
          position: "fixed",
          top: targetRect.top + targetRect.height / 2,
          left: targetRect.left - CALLOUT_GAP,
          transform: "translate(-100%, -50%)",
        };
      case "right":
        return {
          position: "fixed",
          top: targetRect.top + targetRect.height / 2,
          left: targetRect.right + CALLOUT_GAP,
          transform: "translateY(-50%)",
        };
      case "top":
        return {
          position: "fixed",
          top: targetRect.top - CALLOUT_GAP,
          left: targetRect.left + targetRect.width / 2,
          transform: "translate(-50%, -100%)",
        };
      case "bottom":
        return {
          position: "fixed",
          top: targetRect.bottom + CALLOUT_GAP,
          left: targetRect.left + targetRect.width / 2,
          transform: "translateX(-50%)",
        };
      default:
        return {};
    }
  })();

  // Four panels around the target catch clicks anywhere else (dismiss only, nothing behind them is
  // triggered). The target itself has no panel over it, so clicks go straight through.
  const panel = "fixed";
  const hit = { zIndex: 50, pointerEvents: "auto" };
  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      <div className={panel} style={{ ...hit, top: 0, left: 0, right: 0, height: targetRect.top }} onClick={onDismiss} />
      <div className={panel} style={{ ...hit, top: targetRect.bottom, left: 0, right: 0, bottom: 0 }} onClick={onDismiss} />
      <div className={panel} style={{ ...hit, top: targetRect.top, left: 0, width: targetRect.left, height: targetRect.height }} onClick={onDismiss} />
      <div className={panel} style={{ ...hit, top: targetRect.top, left: targetRect.right, right: 0, height: targetRect.height }} onClick={onDismiss} />

      {/* Spotlight cutout (the dim comes from its shadow; it never takes clicks) */}
      <div
        className="rounded-sm"
        style={{
          position: "fixed",
          top: targetRect.top - 4,
          left: targetRect.left - 4,
          width: targetRect.width + 8,
          height: targetRect.height + 8,
          boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.4)",
          zIndex: 51,
          pointerEvents: "none",
        }}
      />

      {/* Callout */}
      <div style={{ ...calloutStyle, zIndex: 52, pointerEvents: "auto" }}>
        <Callout
          text={calloutText}
          actionText={calloutActionText}
          onAction={onDismiss}
          pointerPosition={pointerMap[calloutPosition]}
        />
      </div>
    </div>
  );
};

SpotlightOverlay.propTypes = {
  targetRef: PropTypes.shape({ current: PropTypes.any }).isRequired,
  calloutText: PropTypes.string.isRequired,
  calloutActionText: PropTypes.string,
  calloutPosition: PropTypes.oneOf(["left", "right", "top", "bottom"]),
  onDismiss: PropTypes.func.isRequired,
};

export default SpotlightOverlay;
