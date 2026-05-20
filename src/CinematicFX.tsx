/**
 * CinematicFX — reusable visual effects layer
 *
 * Includes:
 * - FilmGrain      — animated Perlin-like noise overlay
 * - Vignette       — dark edge falloff (radial gradient)
 * - LensFlare      — SVG-based lens flare that sweeps across
 * - ChromaticAberration — subtle RGB channel split on text
 * - CinematicBars  — letterbox bars (adds cinematic 2.39:1 feel)
 * - ColorGradeOverlay — teal-orange LUT simulation via CSS
 */

import React, { useMemo } from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from 'remotion';

const itp = (
  frame: number,
  [f0, f1]: [number, number],
  [v0, v1]: [number, number],
  easing?: (t: number) => number,
) =>
  interpolate(frame, [f0, f1], [v0, v1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing,
  });

// ── Film grain (SVG feTurbulence animated) ────────────────────────────────────
export const FilmGrain: React.FC<{ opacity?: number; speed?: number }> = ({
  opacity = 0.055,
  speed = 4,
}) => {
  const frame = useCurrentFrame();
  // Seed changes every few frames for flickering grain
  const seed  = Math.floor(frame / speed) % 999;

  return (
    <svg
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', mixBlendMode: 'overlay' }}
      width="100%"
      height="100%"
    >
      <defs>
        <filter id={`grain-${seed}`} x="0%" y="0%" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.75"
            numOctaves="4"
            seed={seed}
            stitchTiles="stitch"
            result="noise"
          />
          <feColorMatrix type="saturate" values="0" in="noise" result="gray" />
          <feBlend in="SourceGraphic" in2="gray" mode="overlay" />
        </filter>
      </defs>
      <rect
        width="100%"
        height="100%"
        filter={`url(#grain-${seed})`}
        opacity={opacity}
      />
    </svg>
  );
};

// ── Vignette ─────────────────────────────────────────────────────────────────
export const Vignette: React.FC<{ strength?: number; color?: string }> = ({
  strength = 0.55,
  color = '#000000',
}) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      background: `radial-gradient(ellipse 90% 90% at 50% 50%, transparent 40%, ${color}${Math.round(strength * 255).toString(16).padStart(2, '0')} 100%)`,
    }}
  />
);

// ── Lens flare ────────────────────────────────────────────────────────────────
export const LensFlare: React.FC<{
  triggerFrame: number;
  duration?: number;
  color?: string;
}> = ({ triggerFrame, duration = 40, color = '#FFD700' }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const progress = itp(frame, [triggerFrame, triggerFrame + duration], [0, 1]);
  const alpha =
    itp(frame, [triggerFrame, triggerFrame + 10], [0, 1]) *
    itp(frame, [triggerFrame + duration - 10, triggerFrame + duration], [1, 0]);

  if (alpha <= 0) return null;

  const flareX = width * 0.15 + progress * width * 0.7;
  const flareY = height * 0.3 + Math.sin(progress * Math.PI) * height * 0.05;

  return (
    <svg
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: alpha }}
      width="100%"
      height="100%"
    >
      <defs>
        <radialGradient id="flare-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="white"  stopOpacity="0.95" />
          <stop offset="30%"  stopColor={color}  stopOpacity="0.7" />
          <stop offset="100%" stopColor={color}  stopOpacity="0" />
        </radialGradient>
        <radialGradient id="flare-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Core burst */}
      <ellipse cx={flareX} cy={flareY} rx={32} ry={32}
        fill="url(#flare-core)" />

      {/* Outer glow */}
      <ellipse cx={flareX} cy={flareY} rx={130} ry={80}
        fill="url(#flare-glow)" />

      {/* Horizontal streak */}
      <line
        x1={flareX - 220} y1={flareY}
        x2={flareX + 220} y2={flareY}
        stroke={color} strokeWidth="1.5" opacity="0.35"
      />
      <line
        x1={flareX - 80} y1={flareY}
        x2={flareX + 80} y2={flareY}
        stroke="white" strokeWidth="3" opacity="0.6"
      />

      {/* Diagonal starbursts */}
      {[45, 135].map((angle, i) => {
        const rad = (angle * Math.PI) / 180;
        const len = 160;
        return (
          <line key={i}
            x1={flareX - Math.cos(rad) * len} y1={flareY - Math.sin(rad) * len}
            x2={flareX + Math.cos(rad) * len} y2={flareY + Math.sin(rad) * len}
            stroke={color} strokeWidth="1" opacity="0.3"
          />
        );
      })}

      {/* Secondary flares along the streak path */}
      {[0.35, 0.65].map((t, i) => {
        const sx = flareX - 200 + t * 400;
        const sy = flareY + (i === 0 ? -20 : 15);
        return (
          <ellipse key={i} cx={sx} cy={sy} rx={22 - i * 8} ry={22 - i * 8}
            fill={color} opacity="0.2 " />
        );
      })}
    </svg>
  );
};

// ── Cinematic bars (letterbox) ────────────────────────────────────────────────
export const CinematicBars: React.FC<{ barHeight?: number; alpha?: number }> = ({
  barHeight = 88,
  alpha = 0.92,
}) => (
  <>
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0,
      height: barHeight,
      background: `rgba(0,0,0,${alpha})`,
      pointerEvents: 'none',
      zIndex: 100,
    }} />
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      height: barHeight,
      background: `rgba(0,0,0,${alpha})`,
      pointerEvents: 'none',
      zIndex: 100,
    }} />
  </>
);

// ── Teal-Orange LUT simulation (CSS blend) ────────────────────────────────────
// Real cinema LUTs push shadows toward teal and highlights toward warm orange.
// We simulate this with a CSS mix-blend-mode overlay.
export const CinematicColorGrade: React.FC<{ intensity?: number }> = ({
  intensity = 0.22,
}) => (
  <>
    {/* Shadows → teal */}
    <div style={{
      position: 'absolute', inset: 0, pointerEvents: 'none',
      background: 'radial-gradient(ellipse 120% 120% at 50% 120%, rgba(0,60,80,0.35) 0%, transparent 60%)',
      mixBlendMode: 'color',
      opacity: intensity * 1.2,
    }} />
    {/* Highlights → warm orange */}
    <div style={{
      position: 'absolute', inset: 0, pointerEvents: 'none',
      background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(255,160,50,0.25) 0%, transparent 60%)',
      mixBlendMode: 'screen',
      opacity: intensity,
    }} />
    {/* Overall contrast boost */}
    <div style={{
      position: 'absolute', inset: 0, pointerEvents: 'none',
      background: 'transparent',
      mixBlendMode: 'multiply',
      opacity: 0,
      backdropFilter: 'contrast(1.08) saturate(1.12)',
    }} />
  </>
);

// ── Chromatic aberration on a text element ────────────────────────────────────
export const ChromaText: React.FC<{
  text: string;
  style?: React.CSSProperties;
  aberration?: number;
}> = ({ text, style = {}, aberration = 2 }) => (
  <div style={{ position: 'relative', display: 'inline-block' }}>
    <span style={{ ...style, position: 'absolute', color: 'rgba(255,0,60,0.55)',
                   transform: `translateX(-${aberration}px)`, userSelect: 'none' }}>
      {text}
    </span>
    <span style={{ ...style, position: 'absolute', color: 'rgba(0,255,200,0.45)',
                   transform: `translateX(${aberration}px)`, userSelect: 'none' }}>
      {text}
    </span>
    <span style={{ ...style, position: 'relative' }}>{text}</span>
  </div>
);

// ── Spring helper (Remotion's spring = GSAP-quality easing) ───────────────────
// Use this instead of raw interpolate for any element entrance.
export const useSpringIn = (startFrame: number, config?: { damping?: number; stiffness?: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({
    frame: frame - startFrame,
    fps,
    config: {
      damping:   config?.damping   ?? 18,
      stiffness: config?.stiffness ?? 120,
      mass: 1,
    },
    from: 0,
    to:   1,
  });
};
