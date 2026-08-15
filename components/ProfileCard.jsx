"use client";

import Image from "next/image";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./ProfileCard.css";

const clamp = (value, min = 0, max = 100) => Math.min(Math.max(value, min), max);
const round = (value, precision = 3) => Number(value.toFixed(precision));
const adjust = (value, fromMin, fromMax, toMin, toMax) =>
  round(toMin + ((toMax - toMin) * (value - fromMin)) / (fromMax - fromMin));

const DEFAULT_GRADIENT =
  "linear-gradient(145deg, rgba(0,255,255,.25) 0%, rgba(236,0,140,.22) 48%, rgba(255,242,0,.16) 100%)";

export default function ProfileCard({
  avatarUrl,
  avatarAlt,
  innerGradient = DEFAULT_GRADIENT,
  behindGlowColor = "rgba(0, 255, 255, .58)",
  behindGlowSize = "58%",
  className = "",
  enableTilt = true,
  name = "Team member",
  title = "Contributor",
  handle,
  status = "P&P core team",
  showUserInfo = true,
  priority = false,
  avatarShape = "cover",
  flipOnClick = false,
  backTitle,
  backDescription,
  backDetails = [],
  onContactClick,
  contactText = "View role",
}) {
  const wrapRef = useRef(null);
  const shellRef = useRef(null);
  const enterTimerRef = useRef(null);
  const leaveRafRef = useRef(null);
  const [isFlipped, setIsFlipped] = useState(false);

  const tiltEngine = useMemo(() => {
    if (!enableTilt) return null;

    let rafId = null;
    let running = false;
    let lastTimestamp = 0;
    let currentX = 0;
    let currentY = 0;
    let targetX = 0;
    let targetY = 0;

    const setVarsFromXY = (x, y) => {
      const shell = shellRef.current;
      const wrap = wrapRef.current;
      if (!shell || !wrap) return;

      const width = shell.clientWidth || 1;
      const height = shell.clientHeight || 1;
      const percentX = clamp((100 / width) * x);
      const percentY = clamp((100 / height) * y);
      const centerX = percentX - 50;
      const centerY = percentY - 50;

      const properties = {
        "--pointer-x": `${percentX}%`,
        "--pointer-y": `${percentY}%`,
        "--background-x": `${adjust(percentX, 0, 100, 35, 65)}%`,
        "--background-y": `${adjust(percentY, 0, 100, 35, 65)}%`,
        "--pointer-from-center": `${clamp(Math.hypot(centerX, centerY) / 50, 0, 1)}`,
        "--pointer-from-top": `${percentY / 100}`,
        "--pointer-from-left": `${percentX / 100}`,
        "--rotate-x": `${round(-(centerX / 7))}deg`,
        "--rotate-y": `${round(centerY / 6)}deg`,
      };

      Object.entries(properties).forEach(([key, value]) => wrap.style.setProperty(key, value));
    };

    const step = (timestamp) => {
      if (!running) return;
      if (!lastTimestamp) lastTimestamp = timestamp;
      const delta = Math.min((timestamp - lastTimestamp) / 1000, 0.1);
      lastTimestamp = timestamp;
      const easing = 1 - Math.exp(-delta / 0.14);

      currentX += (targetX - currentX) * easing;
      currentY += (targetY - currentY) * easing;
      setVarsFromXY(currentX, currentY);

      if (Math.abs(targetX - currentX) > 0.05 || Math.abs(targetY - currentY) > 0.05) {
        rafId = requestAnimationFrame(step);
      } else {
        running = false;
        lastTimestamp = 0;
        rafId = null;
      }
    };

    const start = () => {
      if (running) return;
      running = true;
      lastTimestamp = 0;
      rafId = requestAnimationFrame(step);
    };

    return {
      setTarget(x, y) {
        targetX = x;
        targetY = y;
        start();
      },
      setImmediate(x, y) {
        currentX = x;
        currentY = y;
        setVarsFromXY(x, y);
      },
      cancel() {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
        running = false;
        lastTimestamp = 0;
      },
    };
  }, [enableTilt]);

  const getOffsets = useCallback((event, element) => {
    const rect = element.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }, []);

  useEffect(() => {
    if (!enableTilt || !tiltEngine) return undefined;
    const shell = shellRef.current;
    if (!shell) return undefined;

    const handlePointerEnter = (event) => {
      shell.classList.add("active", "entering");
      if (enterTimerRef.current) window.clearTimeout(enterTimerRef.current);
      enterTimerRef.current = window.setTimeout(() => shell.classList.remove("entering"), 180);
      const { x, y } = getOffsets(event, shell);
      tiltEngine.setTarget(x, y);
    };

    const handlePointerMove = (event) => {
      const { x, y } = getOffsets(event, shell);
      tiltEngine.setTarget(x, y);
    };

    const handlePointerLeave = () => {
      const centerX = shell.clientWidth / 2;
      const centerY = shell.clientHeight / 2;
      tiltEngine.setTarget(centerX, centerY);

      const settle = () => {
        const x = Number.parseFloat(getComputedStyle(wrapRef.current).getPropertyValue("--pointer-x")) || 50;
        const y = Number.parseFloat(getComputedStyle(wrapRef.current).getPropertyValue("--pointer-y")) || 50;
        if (Math.hypot(x - 50, y - 50) < 1) {
          shell.classList.remove("active");
          leaveRafRef.current = null;
        } else {
          leaveRafRef.current = requestAnimationFrame(settle);
        }
      };

      if (leaveRafRef.current) cancelAnimationFrame(leaveRafRef.current);
      leaveRafRef.current = requestAnimationFrame(settle);
    };

    shell.addEventListener("pointerenter", handlePointerEnter);
    shell.addEventListener("pointermove", handlePointerMove);
    shell.addEventListener("pointerleave", handlePointerLeave);
    tiltEngine.setImmediate(shell.clientWidth - 70, 60);
    tiltEngine.setTarget(shell.clientWidth / 2, shell.clientHeight / 2);

    return () => {
      shell.removeEventListener("pointerenter", handlePointerEnter);
      shell.removeEventListener("pointermove", handlePointerMove);
      shell.removeEventListener("pointerleave", handlePointerLeave);
      if (enterTimerRef.current) window.clearTimeout(enterTimerRef.current);
      if (leaveRafRef.current) cancelAnimationFrame(leaveRafRef.current);
      tiltEngine.cancel();
    };
  }, [enableTilt, getOffsets, tiltEngine]);

  const cardStyle = useMemo(
    () => ({
      "--inner-gradient": innerGradient,
      "--behind-glow-color": behindGlowColor,
      "--behind-glow-size": behindGlowSize,
    }),
    [behindGlowColor, behindGlowSize, innerGradient]
  );

  const toggleFlipped = useCallback(() => {
    if (flipOnClick) setIsFlipped((flipped) => !flipped);
  }, [flipOnClick]);

  const handleCardKeyDown = useCallback(
    (event) => {
      if (!flipOnClick || (event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault();
      toggleFlipped();
    },
    [flipOnClick, toggleFlipped]
  );

  return (
    <div
      ref={wrapRef}
      className={`pc-card-wrapper avatar-shape-${avatarShape} ${className}`.trim()}
      style={cardStyle}
    >
      <div className="pc-behind" aria-hidden="true" />
      <div ref={shellRef} className="pc-card-shell">
        <article
          className={`pc-card${isFlipped ? " is-flipped" : ""}`}
          aria-label={`${name}, ${title}`}
          aria-pressed={flipOnClick ? isFlipped : undefined}
          onClick={toggleFlipped}
          onKeyDown={handleCardKeyDown}
          role={flipOnClick ? "button" : undefined}
          tabIndex={flipOnClick ? 0 : undefined}
        >
          <div className="pc-card-face pc-card-front">
            <div className="pc-inside">
              <div className="pc-shine" aria-hidden="true" />
              <div className="pc-glare" aria-hidden="true" />
              <div className="pc-content pc-avatar-content">
                <div className="pc-avatar-frame">
                  <Image
                    className="avatar"
                    src={avatarUrl}
                    alt={avatarAlt || `${name} portrait`}
                    fill
                    sizes="(max-width: 640px) 88vw, (max-width: 1024px) 42vw, 22vw"
                    priority={priority}
                  />
                </div>
                {showUserInfo && (
                  <div className="pc-user-info">
                    <div className="pc-user-details">
                      <div className="pc-mini-avatar">
                        <Image src={avatarUrl} alt="" fill sizes="48px" aria-hidden="true" />
                      </div>
                      <div className="pc-user-text">
                        {handle ? <div className="pc-handle">@{handle}</div> : null}
                        <div className="pc-status">{status}</div>
                      </div>
                    </div>
                    {onContactClick ? (
                      <button
                        type="button"
                        className="pc-contact-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          onContactClick();
                        }}
                      >
                        {contactText}
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
              <div className="pc-content pc-details-content">
                <div className="pc-details">
                  <h3>{name}</h3>
                  <p>{title}</p>
                </div>
              </div>
            </div>
          </div>
          {flipOnClick ? (
            <div className="pc-card-face pc-card-back" aria-hidden={!isFlipped}>
              <div className="pc-back-inner">
                <p className="pc-back-kicker">CAPSTONE CONTRIBUTION</p>
                <h3>{backTitle || title}</h3>
                {backDescription ? <p className="pc-back-description">{backDescription}</p> : null}
                {backDetails.length > 0 ? (
                  <ul className="pc-back-list">
                    {backDetails.map((detail) => <li key={detail}>{detail}</li>)}
                  </ul>
                ) : null}
                <span className="pc-back-hint">Click to return</span>
              </div>
            </div>
          ) : null}
        </article>
      </div>
    </div>
  );
}
