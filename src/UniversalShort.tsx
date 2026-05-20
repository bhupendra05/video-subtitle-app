import React, { useState, useEffect, useMemo } from 'react';
import {
  AbsoluteFill, Audio, Video, Img, Sequence, staticFile,
  useVideoConfig, useCurrentFrame,
  delayRender, continueRender, cancelRender,
  interpolate, Easing, spring,
} from 'remotion';
import { createTikTokStyleCaptions } from '@remotion/captions';
import type { Caption } from '@remotion/captions';
import { loadFont as loadOrbitron } from '@remotion/google-fonts/Orbitron';
import { loadFont as loadBebas }    from '@remotion/google-fonts/BebasNeue';
import {
  FilmGrain, Vignette, LensFlare,
  CinematicColorGrade, ChromaText, useSpringIn,
} from './CinematicFX';

const { fontFamily: orbitron } = loadOrbitron('normal', { weights: ['400', '700', '900'] });
const { fontFamily: bebas }    = loadBebas();

// ── Color schemes ─────────────────────────────────────────────────────────────
const SCHEMES = {
  'teal-gold': {
    bg: '#060418', bg2: '#0d0830',
    accent: '#FFD700', secondary: '#00E5FF', text: '#FFFFFF',
    glow: '#FFD700', particle: '#FFD700', matrix: '#FFD700',
    grad: 'linear-gradient(135deg,#FFD700 0%,#00E5FF 50%,#FFD700 100%)',
    bgGrad: 'radial-gradient(ellipse 100% 90% at 50% 20%, #1a0f3d 0%, #060418 60%, #000 100%)',
    glowOrbs: ['#FFD70033', '#00E5FF1a'],
    symbols: ['$', '💰', '📈', '▲', '✦', '◈', '⬡', '$'],
    chipBg: 'linear-gradient(120deg, #FFD700, #00E5FF)',
    chipText: '#000',
  },
  'cyber-green': {
    bg: '#030d10', bg2: '#071820',
    accent: '#00FF88', secondary: '#00D4FF', text: '#FFFFFF',
    glow: '#00FF88', particle: '#00FF88', matrix: '#00FF88',
    grad: 'linear-gradient(135deg,#00FF88 0%,#00D4FF 50%,#00FF88 100%)',
    bgGrad: 'radial-gradient(ellipse 100% 90% at 50% 20%, #051a14 0%, #030d10 55%, #000 100%)',
    glowOrbs: ['#00FF8822', '#00D4FF18'],
    symbols: ['⬡', '⬡', '◈', '∞', '✦', '▲', '◉', '⬡'],
    chipBg: 'linear-gradient(120deg, #00FF88, #00D4FF)',
    chipText: '#000',
  },
  'fire-red': {
    bg: '#110305', bg2: '#1f0508',
    accent: '#FF4500', secondary: '#FFB800', text: '#FFFFFF',
    glow: '#FF6600', particle: '#FF4500', matrix: '#FF4500',
    grad: 'linear-gradient(135deg,#FF4500 0%,#FFB800 50%,#FF4500 100%)',
    bgGrad: 'radial-gradient(ellipse 100% 90% at 50% 20%, #2a0a00 0%, #110305 55%, #000 100%)',
    glowOrbs: ['#FF450025', '#FFB80015'],
    symbols: ['🔥', '▲', '⚡', '✦', '◈', '⬡', '★', '⚡'],
    chipBg: 'linear-gradient(120deg, #FF4500, #FFB800)',
    chipText: '#fff',
  },
  'electric-blue': {
    bg: '#04001a', bg2: '#0a0030',
    accent: '#4DB8FF', secondary: '#C084FC', text: '#FFFFFF',
    glow: '#4169E1', particle: '#4DB8FF', matrix: '#4DB8FF',
    grad: 'linear-gradient(135deg,#4DB8FF 0%,#C084FC 50%,#4DB8FF 100%)',
    bgGrad: 'radial-gradient(ellipse 100% 90% at 50% 20%, #0d003a 0%, #04001a 55%, #000 100%)',
    glowOrbs: ['#4DB8FF22', '#C084FC18'],
    symbols: ['◉', '★', '✦', '⬡', '◈', '▲', '∞', '◉'],
    chipBg: 'linear-gradient(120deg, #4DB8FF, #C084FC)',
    chipText: '#000',
  },
} as const;

type ColorScheme = keyof typeof SCHEMES;
type Scheme = typeof SCHEMES[ColorScheme];

export type UniversalShortProps = {
  topic: string;
  audioFile: string;
  captionsFile: string;
  brollClips: string[];
  imageSlides: string[];
  colorScheme: ColorScheme;
  titleCard: { headline: string; subline: string };
  cta: string;
  hashtags: string[];
  stats: Array<{ label: string; value: string }>;
  durationInFrames: number;
  fps: number;
};

// ── Easing helpers ────────────────────────────────────────────────────────────
const E = {
  out:   Easing.bezier(0.16, 1, 0.3, 1),
  pop:   Easing.bezier(0.34, 1.56, 0.64, 1),
  inOut: Easing.bezier(0.45, 0, 0.55, 1),
};

const itp = (
  frame: number,
  [f0, f1]: [number, number],
  [v0, v1]: [number, number],
  easing?: (t: number) => number,
) =>
  interpolate(frame, [f0, f1], [v0, v1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing,
  });

// ── Seeded random (deterministic, no Math.random in render) ──────────────────
function seededRand(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

// ── HUD corner brackets ───────────────────────────────────────────────────────
const HUDCorners: React.FC<{ scheme: Scheme; frame: number }> = ({ scheme, frame }) => {
  const pulse = 0.65 + 0.35 * Math.sin(frame * 0.05);
  const size  = 56;
  const pad   = 28;
  const th    = 3;
  const c     = scheme.accent;
  const corners = [
    { top: pad, left: pad,   borderTop: th, borderLeft: th,  borderRight: 0,  borderBottom: 0  },
    { top: pad, right: pad,  borderTop: th, borderLeft: 0,   borderRight: th, borderBottom: 0  },
    { bottom: pad, left: pad,borderTop: 0,  borderLeft: th,  borderRight: 0,  borderBottom: th },
    { bottom: pad, right: pad,borderTop: 0, borderLeft: 0,   borderRight: th, borderBottom: th },
  ] as const;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {corners.map((corner, i) => {
        const alpha = itp(frame, [i * 4, i * 4 + 16], [0, 1]) * pulse;
        const { top, left, right, bottom, ...borders } = corner;
        return (
          <div key={i} style={{
            position: 'absolute',
            top, left, right, bottom,
            width: size, height: size,
            borderTop:    borders.borderTop    ? `${borders.borderTop}px solid ${c}` : 'none',
            borderLeft:   borders.borderLeft   ? `${borders.borderLeft}px solid ${c}` : 'none',
            borderRight:  borders.borderRight  ? `${borders.borderRight}px solid ${c}` : 'none',
            borderBottom: borders.borderBottom ? `${borders.borderBottom}px solid ${c}` : 'none',
            opacity: alpha,
            boxShadow: `0 0 18px ${c}88, 0 0 6px ${c}`,
          }} />
        );
      })}
      {/* REC indicator */}
      <div style={{
        position: 'absolute', top: 36, left: 108,
        display: 'flex', alignItems: 'center', gap: 8,
        opacity: itp(frame, [20, 35], [0, 1]),
      }}>
        <div style={{
          width: 10, height: 10, borderRadius: '50%',
          background: '#FF3333',
          boxShadow: '0 0 12px #FF3333',
          opacity: 0.6 + 0.4 * Math.sin(frame * 0.15),
        }} />
        <span style={{
          fontFamily: orbitron, fontSize: 11, color: '#FF3333',
          letterSpacing: 3, opacity: 0.85,
        }}>REC</span>
      </div>
      {/* Frame counter top-right */}
      <div style={{
        position: 'absolute', top: 38, right: 108,
        fontFamily: orbitron, fontSize: 10,
        color: `${scheme.accent}88`, letterSpacing: 2,
        opacity: itp(frame, [25, 40], [0, 0.7]),
      }}>
        {String(frame).padStart(5, '0')}
      </div>
    </AbsoluteFill>
  );
};

// ── Neon border ───────────────────────────────────────────────────────────────
const NeonBorder: React.FC<{ scheme: Scheme }> = ({ scheme }) => {
  const frame = useCurrentFrame();
  const glow  = 10 + 8 * Math.sin(frame * 0.04);
  const alpha = 0.55 + 0.2 * Math.sin(frame * 0.06);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{
        position: 'absolute', inset: 0,
        border: `2px solid ${scheme.accent}`,
        opacity: alpha,
        boxShadow: `
          inset 0 0 ${glow}px ${scheme.accent}55,
          inset 0 0 ${glow * 3}px ${scheme.accent}22,
          0 0 ${glow}px ${scheme.accent}44
        `,
      }} />
    </AbsoluteFill>
  );
};

// ── Particle dots (100 floating dots, always visible) ────────────────────────
const ParticleDots: React.FC<{ scheme: Scheme; count?: number }> = ({ scheme, count = 70 }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const dots = useMemo(() =>
    Array.from({ length: count }, (_, i) => ({
      x:      seededRand(i * 3)     * width,
      y:      seededRand(i * 3 + 1) * height,
      size:   1.5 + seededRand(i * 3 + 2) * 3.5,
      speedX: (seededRand(i * 7)    - 0.5) * 0.35,
      speedY: (seededRand(i * 7 + 1) - 0.5) * 0.25,
      phase:  seededRand(i * 5) * Math.PI * 2,
      isGlow: seededRand(i * 17) > 0.75,
      colorT: seededRand(i * 11),
    })),
  [count, width, height]);

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', overflow: 'hidden' }}>
      {dots.map((d, i) => {
        const x    = ((d.x + d.speedX * frame + Math.sin(frame * 0.012 + d.phase) * 18) % width  + width)  % width;
        const y    = ((d.y + d.speedY * frame + Math.cos(frame * 0.010 + d.phase) * 14) % height + height) % height;
        const pulse = 0.45 + 0.55 * Math.sin(frame * 0.05 + d.phase);
        const color = d.colorT < 0.5 ? scheme.accent : scheme.secondary;
        const size  = d.size * (d.isGlow ? 1 + pulse * 0.4 : 1);
        return (
          <div key={i} style={{
            position: 'absolute', left: x, top: y,
            width: size, height: size, borderRadius: '50%',
            background: color,
            opacity: (0.25 + pulse * 0.3) * (d.isGlow ? 1 : 0.55),
            boxShadow: d.isGlow ? `0 0 ${size * 4}px ${color}` : 'none',
          }} />
        );
      })}
    </AbsoluteFill>
  );
};

// ── Animated grid background ──────────────────────────────────────────────────
const TechGrid: React.FC<{ scheme: Scheme; opacity?: number }> = ({ scheme, opacity = 0.07 }) => {
  const frame = useCurrentFrame();
  const offset = (frame * 1.5) % 55;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity }}>
      <svg style={{ position: 'absolute', inset: 0 }} width="100%" height="100%">
        <defs>
          <pattern id="tgrid" width="55" height="55" patternUnits="userSpaceOnUse"
            x={offset} y={offset}>
            <path d="M55 0L0 0 0 55" fill="none" stroke={scheme.accent} strokeWidth="0.6" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#tgrid)" />
      </svg>
    </AbsoluteFill>
  );
};

// ── Perspective floor grid ────────────────────────────────────────────────────
const PerspGrid: React.FC<{ scheme: Scheme }> = ({ scheme }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const scroll = (frame * 2.8) % 90;
  const VPX = width / 2;
  const VPY = height * 0.55;

  const hLines = Array.from({ length: 14 }, (_, i) => {
    const t   = Math.pow((i + 1) / 14, 1.8);
    const y   = VPY + (height - VPY) * t;
    const yAn = VPY + ((height - VPY) * t + scroll * (height - VPY) / 90) % (height - VPY);
    if (yAn < VPY) return null;
    return { y: yAn, alpha: t * 0.22 };
  }).filter(Boolean) as { y: number; alpha: number }[];

  const vLines = Array.from({ length: 13 }, (_, i) => ({
    x: i * (width / 12),
  }));

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <svg width="100%" height="100%" style={{ position: 'absolute', opacity: 0.6 }}>
        {hLines.map((l, i) => (
          <line key={i} x1={0} y1={l.y} x2={width} y2={l.y}
            stroke={scheme.accent} strokeWidth={0.8} opacity={l.alpha} />
        ))}
        {vLines.map((v, i) => (
          <line key={`v${i}`} x1={VPX} y1={VPY} x2={v.x} y2={height}
            stroke={scheme.accent} strokeWidth={0.6} opacity={0.12} />
        ))}
      </svg>
    </AbsoluteFill>
  );
};

// ── Glowing orb background ────────────────────────────────────────────────────
const GlowOrbs: React.FC<{ scheme: Scheme }> = ({ scheme }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const pulse1  = 0.7 + Math.sin(frame * 0.04) * 0.15;
  const pulse2  = 0.7 + Math.sin(frame * 0.035 + 2) * 0.18;
  const drift1X = Math.sin(frame * 0.008) * 60;
  const drift1Y = Math.cos(frame * 0.006) * 40;
  const drift2X = Math.cos(frame * 0.007 + 1) * 55;
  const drift2Y = Math.sin(frame * 0.009 + 3) * 35;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{
        position: 'absolute',
        left: width * 0.5 + drift1X - 380, top: height * 0.25 + drift1Y - 380,
        width: 760, height: 760, borderRadius: '50%',
        background: `radial-gradient(circle, ${scheme.glowOrbs[0]} 0%, transparent 70%)`,
        transform: `scale(${pulse1})`,
      }} />
      <div style={{
        position: 'absolute',
        left: width * 0.3 + drift2X - 300, top: height * 0.68 + drift2Y - 300,
        width: 600, height: 600, borderRadius: '50%',
        background: `radial-gradient(circle, ${scheme.glowOrbs[1]} 0%, transparent 70%)`,
        transform: `scale(${pulse2})`,
      }} />
    </AbsoluteFill>
  );
};

// ── Animated background with beat pulse ──────────────────────────────────────
const AnimatedBg: React.FC<{ scheme: Scheme; opacity?: number }> = ({ scheme, opacity = 1 }) => {
  const frame   = useCurrentFrame();
  const { height } = useVideoConfig();
  const scanY   = (frame * 3.2) % height;
  // Beat pulse: every 30 frames, brief brightness boost
  const beatAge = frame % 30;
  const beat    = 1 + itp(beatAge, [0, 4], [0.05, 0], E.out);

  return (
    <AbsoluteFill style={{ opacity }}>
      <AbsoluteFill style={{ background: scheme.bgGrad, transform: `scale(${beat})` }} />
      <TechGrid scheme={scheme} opacity={0.07} />
      <div style={{
        position: 'absolute', left: 0, right: 0, top: scanY, height: 1.5,
        background: `linear-gradient(90deg, transparent, ${scheme.accent}55, transparent)`,
      }} />
      <GlowOrbs scheme={scheme} />
    </AbsoluteFill>
  );
};

// ── Matrix digital rain ───────────────────────────────────────────────────────
const MatrixRain: React.FC<{ opacity?: number; scheme: Scheme }> = ({ opacity = 0.14, scheme }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const cols = useMemo(() => {
    const colW = 26, n = Math.ceil(width / colW);
    return Array.from({ length: n }, (_, i) => ({
      x: i * colW, speed: 1.1 + (i % 7) * 0.45,
      phase: (i * 137) % height, len: 6 + (i % 10),
    }));
  }, [width, height]);

  return (
    <svg style={{ position: 'absolute', inset: 0, opacity, pointerEvents: 'none' }} width="100%" height="100%">
      {cols.map((col, ci) =>
        Array.from({ length: col.len }, (_, ri) => {
          const y    = ((col.phase + frame * col.speed + ri * 28) % (height + 200)) - 100;
          const char = String.fromCharCode(0x30A0 + ((frame * 3 + ci * 7 + ri * 13) % 96));
          const a    = 1 - ri / col.len;
          return (
            <text key={`${ci}-${ri}`} x={col.x} y={y}
              fill={ri === 0 ? '#FFFFFF' : scheme.matrix}
              fontSize="16" fontFamily="monospace" opacity={a * 0.85}>
              {char}
            </text>
          );
        }),
      )}
    </svg>
  );
};

// ── Floating symbol particles ─────────────────────────────────────────────────
const Particles: React.FC<{ scheme: Scheme; count?: number; alpha?: number }> = ({
  scheme, count = 30, alpha = 1,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const items = useMemo(
    () => Array.from({ length: count }, (_, i) => ({
      x:     ((i * 137.508) % 1) * width,
      baseY: ((i * 233.0)   % 1) * height,
      size:  14 + (i % 5) * 6,
      speed: 0.18 + (i % 8) * 0.05,
      sym:   scheme.symbols[i % scheme.symbols.length],
      col:   i % 3 === 0 ? scheme.accent : i % 3 === 1 ? scheme.secondary : scheme.glow,
      phase: i * 7,
    })),
    [count, width, height, scheme],
  );

  return (
    <>
      {items.map((p, i) => {
        const y = ((p.baseY - (frame * p.speed + p.phase) % height + height * 2) % height);
        return (
          <div key={i} style={{
            position: 'absolute', left: p.x, top: y,
            fontSize: p.size, color: p.col,
            opacity: (0.1 + (i % 5) * 0.04) * alpha,
            fontFamily: 'monospace', pointerEvents: 'none',
            textShadow: `0 0 10px ${p.col}`,
          }}>
            {p.sym}
          </div>
        );
      })}
    </>
  );
};

// ── Rotating sunburst rays ────────────────────────────────────────────────────
const Rays: React.FC<{
  cx: number; cy: number; r0: number; r1: number;
  count?: number; color?: string; rpm?: number; opacity?: number;
}> = ({ cx, cy, r0, r1, count = 18, color, rpm = 0.38, opacity = 0.12 }) => {
  const frame = useCurrentFrame();
  const deg   = frame * rpm;
  return (
    <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity }} width="100%" height="100%">
      {Array.from({ length: count }, (_, i) => {
        const a = ((i / count) * 360 + deg) * (Math.PI / 180);
        return (
          <line key={i}
            x1={cx + Math.cos(a) * r0} y1={cy + Math.sin(a) * r0}
            x2={cx + Math.cos(a) * r1} y2={cy + Math.sin(a) * r1}
            stroke={color} strokeWidth={i % 3 === 0 ? 2 : 1}
            opacity={0.14 + (i % 4) * 0.06} />
        );
      })}
    </svg>
  );
};

// ── Glitch text ───────────────────────────────────────────────────────────────
const GlitchText: React.FC<{
  text: string; size: number; color: string; font?: string; letterSpacing?: number;
}> = ({ text, size, color, font = bebas, letterSpacing = 6 }) => {
  const frame    = useCurrentFrame();
  const isGlitch = frame % 54 < 3;
  const offsetX  = isGlitch ? (frame % 7) - 3 : 0;

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {isGlitch && (
        <>
          <div style={{
            position: 'absolute', inset: 0,
            fontFamily: font, fontSize: size, color: '#FF0040',
            letterSpacing, opacity: 0.55,
            transform: `translateX(${offsetX + 3}px)`,
            clipPath: 'inset(20% 0 58% 0)',
          }}>{text}</div>
          <div style={{
            position: 'absolute', inset: 0,
            fontFamily: font, fontSize: size, color: '#00FFAA',
            letterSpacing, opacity: 0.45,
            transform: `translateX(${-offsetX - 3}px)`,
            clipPath: 'inset(58% 0 18% 0)',
          }}>{text}</div>
        </>
      )}
      <div style={{ fontFamily: font, fontSize: size, color, letterSpacing, position: 'relative' }}>
        {text}
      </div>
    </div>
  );
};

// ── Count-up number ───────────────────────────────────────────────────────────
const CountUp: React.FC<{
  rawValue: string; startF: number; endF: number; scheme: Scheme; big?: boolean;
}> = ({ rawValue, startF, endF, scheme, big = false }) => {
  const frame = useCurrentFrame();
  const match = rawValue.match(/^([+$€£¥#]?)(\d+\.?\d*)([KMBT%x]?)$/);
  if (!match) {
    return (
      <div style={{
        fontFamily: bebas, fontSize: big ? 128 : 86, color: scheme.accent,
        letterSpacing: 4, lineHeight: 1,
        textShadow: `0 0 40px ${scheme.glow}, 0 0 80px ${scheme.glow}55`,
      }}>{rawValue}</div>
    );
  }
  const [, prefix, numStr, suffix] = match;
  const target  = parseFloat(numStr);
  const prog    = itp(frame, [startF, endF], [0, 1], E.inOut);
  const current = target * prog;
  const display = current < 10 ? current.toFixed(1) : Math.round(current).toString();
  const fs      = big ? 138 : 86;

  return (
    <div style={{
      fontFamily: bebas, fontSize: fs, color: scheme.accent,
      letterSpacing: 4, lineHeight: 1,
      textShadow: `0 0 40px ${scheme.glow}, 0 0 80px ${scheme.glow}55, 0 0 120px ${scheme.glow}22`,
    }}>
      {prefix}<span style={{ fontSize: fs * 0.75 }}>{prefix === '' ? '' : ''}</span>
      {prefix}{display}{suffix}
    </div>
  );
};

// ── Circular progress ring (SVG) ──────────────────────────────────────────────
const CircularProgress: React.FC<{
  startF: number; endF: number; radius: number; color: string; stroke?: number;
}> = ({ startF, endF, radius, color, stroke = 5 }) => {
  const frame = useCurrentFrame();
  const pct   = itp(frame, [startF + 10, endF], [0, 1], E.inOut);
  const circ  = 2 * Math.PI * radius;
  const dash  = circ * pct;
  const size  = (radius + stroke * 2) * 2;
  const cx    = size / 2;
  return (
    <svg width={size} height={size} style={{ position: 'absolute', top: -stroke * 2, left: -stroke * 2, transform: 'rotate(-90deg)' }}>
      {/* Track */}
      <circle cx={cx} cy={cx} r={radius} fill="none" stroke={`${color}22`} strokeWidth={stroke} />
      {/* Fill */}
      <circle cx={cx} cy={cx} r={radius} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 8px ${color})` }} />
    </svg>
  );
};

// ── Scrolling ticker bar ──────────────────────────────────────────────────────
const TickerBar: React.FC<{
  stats: Array<{ label: string; value: string }>;
  hashtags: string[];
  scheme: Scheme;
}> = ({ stats, hashtags, scheme }) => {
  const frame  = useCurrentFrame();
  const items  = [
    ...stats.map(s => `${s.label}: ${s.value}`),
    ...hashtags.map(h => `#${h.replace(/^#/, '')}`),
    ...stats.map(s => `${s.label}: ${s.value}`),
    ...hashtags.map(h => `#${h.replace(/^#/, '')}`),
  ];
  const itemW  = 240;
  const total  = items.length * itemW;
  const scrollX = -(frame * 2) % total;

  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, height: 52,
      background: `linear-gradient(90deg, ${scheme.bg}ee, ${scheme.bg2}ee)`,
      borderTop: `1px solid ${scheme.accent}55`,
      display: 'flex', alignItems: 'center', overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', transform: `translateX(${scrollX}px)`, whiteSpace: 'nowrap' }}>
        {[...items, ...items].map((item, i) => (
          <div key={i} style={{ width: itemW, display: 'flex', alignItems: 'center', padding: '0 16px', flexShrink: 0, gap: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: scheme.accent, boxShadow: `0 0 8px ${scheme.accent}` }} />
            <span style={{ fontFamily: orbitron, fontSize: 13, color: scheme.accent, letterSpacing: 2 }}>{item}</span>
            <span style={{ color: '#444', fontSize: 18, marginLeft: 4 }}>·</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Ken Burns with hard flash-cut on entry ────────────────────────────────────
const KenBurns: React.FC<{ src: string; duration: number; index: number; scheme: Scheme }> = ({
  src, duration, index, scheme,
}) => {
  const frame = useCurrentFrame();
  const moves: Array<[number, number, number, number, string]> = [
    [1.0, 1.22, 0,   -40,  'center top'],
    [1.25, 1.0, 40,  0,    'center center'],
    [1.0, 1.25, -30, 25,   'center bottom'],
    [1.18, 1.0, 0,   40,   'center center'],
    [1.0, 1.28, 25,  -25,  'right top'],
    [1.22, 1.0, -25, 0,    'left center'],
  ];
  const [s0, s1, panX, panY, origin] = moves[index % moves.length];

  // Flash cut: hard white flash on first 5 frames
  const flashAlpha = itp(frame, [0, 5], [0.85, 0], E.out);
  // Burst: extra zoom on entry that decays
  const burstScale = 1 + itp(Math.min(frame, 14), [0, 14], [0.08, 0], E.out);
  const mainScale  = itp(frame, [0, duration], [s0, s1], E.inOut);
  const scale      = mainScale * burstScale;

  const px = itp(frame, [0, duration], [0, panX], E.inOut);
  const py = itp(frame, [0, duration], [0, panY], E.inOut);
  const edgeFade = Math.min(
    itp(frame, [0, 15], [0, 1], E.out),
    itp(frame, [duration - 15, duration], [1, 0], E.inOut),
  );

  return (
    <AbsoluteFill style={{ overflow: 'hidden', opacity: edgeFade }}>
      <Img src={staticFile(src)} style={{
        width: '100%', height: '100%', objectFit: 'cover',
        transform: `scale(${scale}) translate(${px}px, ${py}px)`,
        transformOrigin: origin,
      }} />
      {/* Cinematic gradient scrim */}
      <AbsoluteFill style={{
        background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 28%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.88) 100%)',
      }} />
      {/* Accent tint */}
      <AbsoluteFill style={{
        background: `radial-gradient(ellipse 80% 60% at 50% 30%, ${scheme.accent}08 0%, transparent 70%)`,
        mixBlendMode: 'screen',
      }} />
      {/* Flash cut overlay */}
      <AbsoluteFill style={{ background: 'white', opacity: flashAlpha, pointerEvents: 'none' }} />
    </AbsoluteFill>
  );
};

// ── Confetti ──────────────────────────────────────────────────────────────────
const Confetti: React.FC<{ scheme: Scheme }> = ({ scheme }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const pieces = useMemo(() => {
    const cols = [scheme.accent, scheme.secondary, '#FF69B4', '#FFD700', scheme.glow, '#00FFAA'];
    return Array.from({ length: 70 }, (_, i) => ({
      x: seededRand(i * 31) * width,
      startY: height * 0.5 + seededRand(i * 41 + 1) * height * 0.4,
      vy: 3 + seededRand(i * 53) * 10, vx: (seededRand(i * 61) - 0.5) * 6,
      w: 7 + seededRand(i * 71) * 13, h: 5 + seededRand(i * 83) * 8,
      col: cols[i % cols.length], rot0: seededRand(i * 97) * 360,
      rotV: (seededRand(i * 113) - 0.5) * 15, delay: Math.floor(seededRand(i * 127) * 28),
    }));
  }, [width, height, scheme]);

  return (
    <>
      {pieces.map((p, i) => {
        const t = frame - p.delay;
        if (t <= 0) return null;
        const a = itp(frame, [p.delay, p.delay + 12], [0, 1]) * itp(frame, [p.delay + 55, p.delay + 90], [1, 0]);
        return (
          <div key={i} style={{
            position: 'absolute',
            left: p.x + p.vx * t, top: p.startY - p.vy * t,
            width: p.w, height: p.h, background: p.col, opacity: a,
            transform: `rotate(${p.rot0 + p.rotV * t}deg)`,
            borderRadius: 2, pointerEvents: 'none',
          }} />
        );
      })}
    </>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// SCENE 1 — TITLE
// ══════════════════════════════════════════════════════════════════════════════
const SceneTitle: React.FC<{
  titleCard: { headline: string; subline: string };
  topic: string;
  scheme: Scheme;
}> = ({ titleCard, topic, scheme }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const chipSpring     = useSpringIn(8,  { damping: 18, stiffness: 110 });
  const headlineSpring = useSpringIn(20, { damping: 12, stiffness: 90  });
  const runSpring      = useSpringIn(36, { damping: 12, stiffness: 90  });
  const lineW          = itp(frame, [46, 92], [0, 340], E.out);
  const subSpring      = useSpringIn(60, { damping: 20, stiffness: 120 });
  const glow           = 32 + Math.sin(frame * 0.09) * 16;

  const words = titleCard.headline.split(' ');
  const half  = Math.ceil(words.length / 2);
  const line1 = words.slice(0, half).join(' ');
  const line2 = words.slice(half).join(' ');

  const bgPulse = 1 + Math.sin(frame * 0.05) * 0.06;

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 0 }}>
      <MatrixRain opacity={0.12} scheme={scheme} />
      <ParticleDots scheme={scheme} count={60} />
      <Rays cx={width / 2} cy={height * 0.42} r0={130} r1={550} count={24} color={scheme.accent} rpm={0.44} opacity={0.18} />

      {/* Glowing halo behind headline */}
      <div style={{
        position: 'absolute',
        left: width / 2 - 280, top: height * 0.28,
        width: 560, height: 320, borderRadius: '50%',
        background: `radial-gradient(ellipse, ${scheme.accent}18 0%, transparent 70%)`,
        transform: `scale(${bgPulse})`,
      }} />

      <LensFlare triggerFrame={22} duration={38} color={scheme.accent} />
      <HUDCorners scheme={scheme} frame={frame} />

      {/* Topic chip */}
      <div style={{
        opacity: Math.min(chipSpring * 2, 1),
        transform: `translateY(${(1 - chipSpring) * 30}px)`,
        padding: '8px 28px', borderRadius: 40,
        border: `1.5px solid ${scheme.accent}88`,
        background: `${scheme.accent}18`,
        fontFamily: orbitron, fontSize: 17, color: scheme.accent,
        letterSpacing: 5, textTransform: 'uppercase' as const, marginBottom: 22,
        boxShadow: `0 0 28px ${scheme.accent}44, inset 0 0 14px ${scheme.accent}11`,
      }}>
        {topic.slice(0, 32)}
      </div>

      {/* Line 1 — slides from left */}
      <ChromaText text={line1} aberration={4} style={{
        opacity: Math.min(headlineSpring, 1),
        transform: `translateX(${(1 - headlineSpring) * -460}px)`,
        fontFamily: bebas, fontSize: 128, color: scheme.accent,
        letterSpacing: 8, lineHeight: 1,
        textShadow: `0 0 ${glow}px ${scheme.glow}, 0 0 70px ${scheme.glow}55`,
        display: 'block',
      }} />

      {/* Line 2 — slides from right */}
      {line2 && (
        <div style={{
          opacity: Math.min(runSpring, 1),
          transform: `translateX(${(1 - runSpring) * 460}px)`,
          fontFamily: bebas, fontSize: 128, color: scheme.text,
          letterSpacing: 8, lineHeight: 1,
          textShadow: '0 0 30px rgba(255,255,255,0.5)',
        }}>{line2}</div>
      )}

      {/* Accent line */}
      <div style={{
        width: lineW, height: 3, marginTop: 18,
        background: `linear-gradient(90deg, transparent, ${scheme.accent}, ${scheme.secondary}, ${scheme.accent}, transparent)`,
        boxShadow: `0 0 18px ${scheme.accent}`,
      }} />

      {/* Subline */}
      <div style={{
        opacity: Math.min(subSpring * 2, 1),
        transform: `translateY(${(1 - subSpring) * 30}px)`,
        fontFamily: orbitron, fontSize: 24, color: scheme.secondary,
        letterSpacing: 3, textAlign: 'center', marginTop: 20, padding: '0 52px',
        textShadow: `0 0 18px ${scheme.secondary}66`,
      }}>{titleCard.subline}</div>

      {/* Bottom line */}
      <div style={{
        position: 'absolute', bottom: 80, left: '10%', right: '10%', height: 1,
        background: `linear-gradient(90deg, transparent, ${scheme.accent}66, transparent)`,
        opacity: Math.min(subSpring * 2, 1),
      }} />
    </AbsoluteFill>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// SCENE 2 — B-ROLL + CAPTIONS (word-bomb style)
// ══════════════════════════════════════════════════════════════════════════════
const SceneBroll: React.FC<{
  brollClips: string[];
  imageSlides: string[];
  captions: Caption[];
  stats: Array<{ label: string; value: string }>;
  hashtags: string[];
  scheme: Scheme;
  sceneDuration: number;
  absoluteFrame: number;
}> = ({ brollClips, imageSlides, captions, stats, hashtags, scheme, sceneDuration, absoluteFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const { pages } = useMemo(() => {
    if (!captions.length) return { pages: [] };
    return createTikTokStyleCaptions({ captions, combineTokensWithinMilliseconds: 1600 });
  }, [captions]);

  const currentMs  = (absoluteFrame / fps) * 1000;
  const activePage = pages.find(p => p.startMs <= currentMs && p.startMs + p.durationMs > currentMs);
  const activeToken = activePage?.tokens.find(t => t.fromMs <= currentMs && t.toMs > currentMs);

  const pageStartFrame = activePage ? Math.round((activePage.startMs / 1000) * fps) : 0;
  const captionAge     = absoluteFrame - pageStartFrame;
  const captionAlpha   = itp(captionAge, [0, 5], [0, 1]);

  const clipDuration = brollClips.length > 0 ? Math.floor(sceneDuration / brollClips.length) : sceneDuration;

  return (
    <AbsoluteFill>
      {/* Visual background */}
      {brollClips.length > 0 ? (
        brollClips.map((clip, i) => (
          <Sequence key={clip} from={i * clipDuration} durationInFrames={clipDuration + 2}>
            <Video src={staticFile(clip)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <AbsoluteFill style={{ background: 'rgba(0,0,0,0.18)' }} />
          </Sequence>
        ))
      ) : imageSlides.length > 0 ? (
        (() => {
          const slideDur = Math.floor(sceneDuration / imageSlides.length);
          return imageSlides.map((src, i) => (
            <Sequence key={src} from={i * slideDur} durationInFrames={slideDur + 24}>
              <KenBurns src={src} duration={slideDur} index={i} scheme={scheme} />
            </Sequence>
          ));
        })()
      ) : (
        <>
          <AnimatedBg scheme={scheme} />
          <MatrixRain opacity={0.12} scheme={scheme} />
          <PerspGrid scheme={scheme} />
        </>
      )}

      {/* Particle overlay */}
      <ParticleDots scheme={scheme} count={35} />

      {/* Gradient scrim for caption legibility */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 500,
        background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.4) 55%, transparent 100%)',
        pointerEvents: 'none',
      }} />

      {/* HUD corners */}
      <HUDCorners scheme={scheme} frame={frame} />

      {/* ── WORD-BOMB CAPTIONS ── */}
      {activePage && (
        <div style={{
          position: 'absolute', bottom: 90, left: 0, right: 0,
          display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
          alignItems: 'center', gap: 10, padding: '0 24px',
          opacity: captionAlpha,
        }}>
          {activePage.tokens.map((token, i) => {
            const isActive = token === activeToken;
            const isPast   = activeToken
              ? activePage.tokens.indexOf(activeToken) > i
              : false;

            // Per-word spring — runs from the moment this word becomes active
            const tokenStartFrame = Math.round((token.fromMs / 1000) * fps);
            const wordAge = Math.max(0, absoluteFrame - tokenStartFrame);
            const wordScale = isActive
              ? spring({ frame: wordAge, fps, config: { damping: 9, stiffness: 600, mass: 0.25 }, from: 1.8, to: 1.0 })
              : 1.0;
            const wordRot = isActive
              ? spring({ frame: wordAge, fps, config: { damping: 14, stiffness: 400, mass: 0.4 }, from: -6, to: 0 })
              : 0;

            const isNum = /\d/.test(token.text);

            return (
              <div key={i} style={{
                display: 'inline-flex',
                padding: isActive ? '8px 22px' : (isPast ? '4px 12px' : '4px 12px'),
                borderRadius: 10,
                background: isActive
                  ? scheme.chipBg
                  : 'transparent',
                transform: `scale(${wordScale}) rotate(${wordRot}deg)`,
                transformOrigin: 'center bottom',
                boxShadow: isActive ? `0 0 35px ${scheme.accent}88, 0 0 70px ${scheme.accent}33` : 'none',
                marginBottom: isActive ? 4 : 0,
              }}>
                <span style={{
                  fontFamily: bebas,
                  fontSize: isActive ? (isNum ? 106 : 96) : (isPast ? 58 : 62),
                  color: isActive
                    ? scheme.chipText
                    : (isPast ? 'rgba(255,255,255,0.38)' : 'rgba(255,255,255,0.72)'),
                  letterSpacing: 3,
                  lineHeight: 1.1,
                  textShadow: isActive
                    ? 'none'
                    : '2px 2px 0 #000, -1px -1px 0 #000',
                  fontWeight: 'bold',
                }}>
                  {token.text.trim()}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <TickerBar stats={stats} hashtags={hashtags} scheme={scheme} />
    </AbsoluteFill>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// SCENE 3 — STATS (dramatic big-number reveal)
// ══════════════════════════════════════════════════════════════════════════════
const SceneStats: React.FC<{
  stats: Array<{ label: string; value: string }>;
  scheme: Scheme;
}> = ({ stats, scheme }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const hdrA = itp(frame, [0, 22], [0, 1]);
  const hdrY = itp(frame, [0, 22], [-50, 0], E.out);

  return (
    <AbsoluteFill style={{ flexDirection: 'column', alignItems: 'center', paddingTop: 60, gap: 18 }}>
      {/* Background */}
      <AbsoluteFill style={{ background: `linear-gradient(160deg, ${scheme.bg}f0 0%, ${scheme.bg2}d8 100%)` }} />
      <GlowOrbs scheme={scheme} />
      <MatrixRain opacity={0.08} scheme={scheme} />
      <ParticleDots scheme={scheme} count={50} />
      <Rays cx={width / 2} cy={height * 0.5} r0={100} r1={580} count={28} color={scheme.accent} rpm={0.35} opacity={0.14} />
      <HUDCorners scheme={scheme} frame={frame} />

      {/* Header */}
      <div style={{ opacity: hdrA, transform: `translateY(${hdrY}px)`, marginBottom: 12 }}>
        <GlitchText text="BY THE NUMBERS" size={74} color={scheme.accent} />
      </div>

      {stats.map((stat, i) => {
        const delay  = i * 28;
        const alpha  = itp(frame, [delay, delay + 28], [0, 1]);
        const slideX = itp(frame, [delay, delay + 28], [i % 2 === 0 ? -120 : 120, 0], E.pop);
        const barW   = itp(frame, [delay + 18, delay + 110], [0, 100], E.inOut);

        // Spring entrance for the whole card
        const cardScale = spring({
          frame: Math.max(0, frame - delay),
          fps: 30,
          config: { damping: 16, stiffness: 200, mass: 0.6 },
          from: 0.7, to: 1.0,
        });

        return (
          <div key={i} style={{
            opacity: alpha,
            transform: `translateX(${slideX}px) scale(${cardScale})`,
            width: '88%', padding: '22px 28px',
            background: `linear-gradient(120deg, ${scheme.accent}28 0%, ${scheme.bg2}bb 100%)`,
            borderRadius: 22, border: `1.5px solid ${scheme.accent}77`,
            boxShadow: `0 0 30px ${scheme.accent}30, inset 0 0 24px ${scheme.accent}0a`,
            position: 'relative', overflow: 'hidden',
          }}>
            {/* Animated fill bar */}
            <div style={{
              position: 'absolute', inset: 0, left: 0,
              width: `${barW}%`,
              background: `${scheme.accent}14`, borderRadius: 22,
            }} />

            {/* Horizontal scan line */}
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              background: `linear-gradient(180deg, transparent 0%, ${scheme.accent}08 50%, transparent 100%)`,
              backgroundSize: '100% 4px',
            }} />

            <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 24 }}>
              {/* Circular progress ring */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <CircularProgress startF={delay} endF={delay + 110} radius={48} color={scheme.accent} stroke={6} />
                <div style={{ width: 96, height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                  <CountUp rawValue={stat.value} startF={delay + 8} endF={delay + 105} scheme={scheme} big={false} />
                </div>
              </div>

              {/* Label + bar */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{
                  fontFamily: orbitron, fontSize: 14, color: scheme.secondary,
                  letterSpacing: 3, textTransform: 'uppercase' as const,
                  textShadow: `0 0 10px ${scheme.secondary}99`,
                }}>{stat.label}</div>
                {/* Progress bar */}
                <div style={{ height: 6, background: `${scheme.accent}22`, borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${barW}%`,
                    background: `linear-gradient(90deg, ${scheme.accent}, ${scheme.secondary})`,
                    borderRadius: 4,
                    boxShadow: `0 0 8px ${scheme.accent}`,
                    transition: 'none',
                  }} />
                </div>
                <div style={{
                  fontFamily: orbitron, fontSize: 11, color: `${scheme.accent}88`, letterSpacing: 2,
                }}>
                  {Math.round(barW)}% COMPLETE
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// SCENE 4 — FINALE
// ══════════════════════════════════════════════════════════════════════════════
const SceneFinale: React.FC<{
  cta: string;
  hashtags: string[];
  scheme: Scheme;
}> = ({ cta, hashtags, scheme }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const ctaSpring  = useSpringIn(0, { damping: 12, stiffness: 90 });
  const hashAlpha  = itp(frame, [44, 78], [0, 1]);
  const hashY      = itp(frame, [44, 78], [32, 0], E.out);
  const glow       = 28 + Math.sin(frame * 0.13) * 18;

  // Follow button pulse
  const btnPulse   = 1 + 0.05 * Math.sin(frame * 0.18);

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 32 }}>
      <AnimatedBg scheme={scheme} />
      <MatrixRain opacity={0.1} scheme={scheme} />
      <ParticleDots scheme={scheme} count={55} />
      <Confetti scheme={scheme} />
      <Rays cx={width / 2} cy={height / 2} r0={70} r1={700} count={32} color={scheme.accent} rpm={0.6} opacity={0.19} />
      <LensFlare triggerFrame={5} duration={40} color={scheme.secondary} />
      <HUDCorners scheme={scheme} frame={frame} />

      {/* Glowing halo */}
      <div style={{
        position: 'absolute',
        left: width / 2 - 320, top: height / 2 - 220,
        width: 640, height: 440, borderRadius: '50%',
        background: `radial-gradient(ellipse, ${scheme.accent}22 0%, transparent 65%)`,
        pointerEvents: 'none',
      }} />

      {/* CTA */}
      <div style={{
        opacity: Math.min(ctaSpring * 2, 1),
        transform: `scale(${0.12 + ctaSpring * 0.88})`,
        textAlign: 'center', padding: '0 44px', position: 'relative',
      }}>
        <ChromaText text={cta} aberration={5} style={{
          fontFamily: bebas, fontSize: 100, letterSpacing: 7, lineHeight: 1.08,
          background: scheme.grad,
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          display: 'block',
          filter: `drop-shadow(0 0 ${glow}px ${scheme.glow})`,
        }} />
      </div>

      {/* Follow button */}
      <div style={{
        opacity: Math.min(ctaSpring * 3, 1),
        transform: `scale(${btnPulse * Math.min(ctaSpring, 1)})`,
        padding: '18px 56px', borderRadius: 60,
        background: scheme.chipBg,
        fontFamily: bebas, fontSize: 38, color: scheme.chipText,
        letterSpacing: 4,
        boxShadow: `0 0 40px ${scheme.accent}88, 0 0 80px ${scheme.accent}33`,
      }}>
        FOLLOW FOR MORE ➤
      </div>

      {/* Hashtags */}
      <div style={{
        opacity: hashAlpha, transform: `translateY(${hashY}px)`,
        fontFamily: orbitron, fontSize: 20, color: scheme.accent,
        letterSpacing: 3, textAlign: 'center',
        textShadow: `0 0 16px ${scheme.accent}`,
        padding: '0 32px',
      }}>
        {hashtags.map(t => `#${t.replace(/^#/, '')}`).join('  ·  ')}
      </div>
    </AbsoluteFill>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// ROOT COMPOSITION
// ══════════════════════════════════════════════════════════════════════════════
export const UniversalShort: React.FC<UniversalShortProps> = ({
  topic, audioFile, captionsFile, brollClips, imageSlides = [],
  colorScheme, titleCard, cta, hashtags, stats, durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const scheme = SCHEMES[colorScheme] ?? SCHEMES['teal-gold'];

  // ── Caption loading ─────────────────────────────────────────────────────────
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [handle] = useState(() => (captionsFile ? delayRender('Loading captions') : null));
  useEffect(() => {
    if (!captionsFile || !handle) return;
    fetch(staticFile(captionsFile))
      .then(r => r.json())
      .then(data => { setCaptions(data); continueRender(handle); })
      .catch(e => cancelRender(e));
  }, [captionsFile, handle]);

  // ── Scene timing ────────────────────────────────────────────────────────────
  const FADE         = 24;
  const TITLE_END    = 210;
  const HAS_STATS    = stats.length > 0;
  const STATS_START  = Math.floor(durationInFrames * 0.52);
  const STATS_DUR    = 175;
  const STATS_END    = STATS_START + STATS_DUR;
  const FINALE_START = durationInFrames - 155;

  const titleAlpha  = itp(frame, [TITLE_END - FADE, TITLE_END + FADE], [1, 0]);
  const brollAlpha  =
    itp(frame, [TITLE_END - FADE, TITLE_END + FADE], [0, 1]) *
    itp(frame, [FINALE_START - FADE, FINALE_START], [1, 0]);
  const statsAlpha  = HAS_STATS
    ? itp(frame, [STATS_START, STATS_START + FADE], [0, 1]) *
      itp(frame, [STATS_END - FADE, STATS_END], [1, 0])
    : 0;
  const finaleAlpha = itp(frame, [FINALE_START - FADE, FINALE_START], [0, 1]);

  return (
    <div style={{ position: 'relative', width, height, overflow: 'hidden', background: '#000' }}>

      {/* Always-on background */}
      <AnimatedBg scheme={scheme} />

      {/* Scene 1 — Title */}
      <div style={{ position: 'absolute', inset: 0, opacity: titleAlpha }}>
        <Sequence from={0} durationInFrames={TITLE_END + FADE}>
          <SceneTitle titleCard={titleCard} topic={topic} scheme={scheme} />
        </Sequence>
      </div>

      {/* Scene 2 — B-roll + captions */}
      <div style={{ position: 'absolute', inset: 0, opacity: brollAlpha }}>
        <Sequence from={TITLE_END - FADE} durationInFrames={FINALE_START - (TITLE_END - FADE) + FADE}>
          <SceneBroll
            brollClips={brollClips}
            imageSlides={imageSlides}
            captions={captions}
            stats={stats}
            hashtags={hashtags}
            scheme={scheme}
            sceneDuration={FINALE_START - TITLE_END}
            absoluteFrame={frame}
          />
        </Sequence>
      </div>

      {/* Scene 3 — Stats */}
      {HAS_STATS && (
        <div style={{ position: 'absolute', inset: 0, opacity: statsAlpha }}>
          <Sequence from={STATS_START} durationInFrames={STATS_DUR}>
            <SceneStats stats={stats} scheme={scheme} />
          </Sequence>
        </div>
      )}

      {/* Scene 4 — Finale */}
      <div style={{ position: 'absolute', inset: 0, opacity: finaleAlpha }}>
        <Sequence from={FINALE_START - FADE} durationInFrames={durationInFrames - (FINALE_START - FADE)}>
          <SceneFinale cta={cta} hashtags={hashtags} scheme={scheme} />
        </Sequence>
      </div>

      {/* Global neon border */}
      <NeonBorder scheme={scheme} />

      {/* FX stack */}
      <CinematicColorGrade intensity={0.14} />
      <FilmGrain opacity={0.032} speed={3} />
      <Vignette strength={0.4} />

      {/* Scene transition lens flares */}
      <LensFlare triggerFrame={TITLE_END}    duration={38} color={scheme.accent}    />
      {HAS_STATS && <LensFlare triggerFrame={STATS_START}  duration={32} color={scheme.secondary} />}
      <LensFlare triggerFrame={FINALE_START} duration={38} color={scheme.secondary} />

      {/* Audio */}
      {audioFile && (
        <Audio
          src={staticFile(audioFile)}
          volume={(f) => interpolate(f, [0, 14], [0, 0.95], { extrapolateRight: 'clamp' })}
        />
      )}
    </div>
  );
};
