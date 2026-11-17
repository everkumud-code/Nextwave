"use client";

import { useEffect, useState } from "react";
import { BrandLogo } from "./brand-logo";

/**
 * On opening, the NextWave logo rolls in like a wave of the sea: the logo ripples on the water and then settles, while two
 * waves wash across the bottom of the screen. Shown once per browser session (not on every page), skipped for people who
 * ask for reduced motion, and gone after about three seconds. Finite animation only; nothing keeps running.
 */
export function LogoSplash() {
  const [phase, setPhase] = useState<"on" | "out" | "off">("on");

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem("nw-splash") === "1";
      sessionStorage.setItem("nw-splash", "1");
    } catch { /* no storage: show it once per page load */ }
    if (seen || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setPhase("off"); return; }
    const out = window.setTimeout(() => setPhase("out"), 2700);
    const off = window.setTimeout(() => setPhase("off"), 3400);
    return () => { window.clearTimeout(out); window.clearTimeout(off); };
  }, []);

  if (phase === "off") return null;
  const wave = "M0 60 C 120 0 240 120 360 60 C 480 0 600 120 720 60 C 840 0 960 120 1080 60 C 1200 0 1320 120 1440 60 L1440 200 L0 200 Z";
  return (
    <div className={`nw-splash${phase === "out" ? " nw-splash-out" : ""}`} aria-hidden="true">
      <svg width="0" height="0" className="absolute">
        <filter id="nw-ripple" x="-5%" y="-15%" width="110%" height="130%">
          <feTurbulence type="fractalNoise" baseFrequency="0.004 0.03" numOctaves="1" seed="4" result="noise">
            <animate attributeName="baseFrequency" dur="2.4s" values="0.004 0.035;0.004 0.016;0.003 0.004" keyTimes="0;0.6;1" fill="freeze" />
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="40" xChannelSelector="R" yChannelSelector="G">
            <animate attributeName="scale" dur="2.4s" values="54;34;12;0" keyTimes="0;0.35;0.8;1" fill="freeze" />
          </feDisplacementMap>
        </filter>
      </svg>
      <div className="nw-waves">
        <svg className="nw-wave nw-wave-back" viewBox="0 0 1440 200" preserveAspectRatio="none"><path d={wave} fill="#BFE0F8" /></svg>
        <svg className="nw-wave nw-wave-front" viewBox="0 0 1440 200" preserveAspectRatio="none"><path d={wave} fill="#0A84E0" fillOpacity="0.9" /></svg>
      </div>
      <BrandLogo className="nw-splash-logo" />
    </div>
  );
}
