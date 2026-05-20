import React, { useState, useEffect, useMemo } from 'react';
import {
  AbsoluteFill, Audio, Video, Img, Sequence, staticFile,
  useVideoConfig, useCurrentFrame,
  delayRender, continueRender, cancelRender,
  interpolate, Easing,
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

// ── Color schemes — rich, vibrant, NOT pure black ─────────────────────────────
const SCHEMES = {
  'teal-gold': {
    bg: '#060418',          // deep indigo
    bg2: '#0d0830',         // mid tone
    accent: '#FFD700',
    secondary: '#00E5FF',
    text: '#FFFFFF',
    glow: '#FFD700',
    particle: '#FFD700',
    matrix: '#FFD700',
    grad: 'linear-gradient(135deg,#FFD700 0%,#00E5FF 50%,#FFD700 100%)',
    bgGrad: 'radial-gradient(ellipse 100% 90% at 50% 20%, #1a0f3d 0%, #060418 60%, #000 100%)',
    glowOrbs: ['#FFD70033', '#00E5FF1a'],
    symbols: ['$', '💰', '📈', '▲', '✦', '◈', '⬡', '$'],
  },
  'cyber-green': {
    bg: '#030d10',          // deep teal-black
    bg2: '#071820',
    accent: '#00FF88',
    secondary: '#00D4FF',
    text: '#FFFFFF',
    glow: '#00FF88',
    particle: '#00FF88',
    matrix: '#00FF88',
    grad: 'linear-gradient(135deg,#00FF88 0%,#00D4FF 50%,#00FF88 100%)',
    bgGrad: 'radial-gradient(ellipse 100% 90% at 50% 20%, #051a14 0%, #030d10 55%, #000 100%)',
    glowOrbs: ['#00FF8822', '#00D4FF18'],
    symbols: ['⬡', '⬡', '◈', '∞', '✦', '▲', '◉', '⬡'],
  },
  'fire-red': {
    bg: '#110305',          // deep crimson-black
    bg2: '#1f0508',
    accent: '#FF4500',
    secondary: '#FFB800',
    text: '#FFFFFF',
    glow: '#FF6600',
    particle: '#FF4500',
    matrix: '#FF4500',
    grad: 'linear-gradient(135deg,#FF4500 0%,#FFB800 50%,#FF4500 100%)',
    bgGrad: 'radial-gradient(ellipse 100% 90% at 50% 20%, #2a0a00 0%, #110305 55%, #000 100%)',
    glowOrbs: ['#FF450025', '#FFB80015'],
    symbols: ['🔥', '▲', '⚡', '✦', '◈', '⬡', '★', '⚡'],
  },
  'electric-blue': {
    bg: '#04001a',          // deep violet-black
    bg2: '#0a0030',
    accent: '#4DB8FF',
    secondary: '#C084FC',
    text: '#FFFFFF',
    glow: '#4169E1',
    particle: '#4DB8FF',
    matrix: '#4DB8FF',
    grad: 'linear-gradient(135deg,#4DB8FF 0%,#C084FC 50%,#4DB8FF 100%)',
    bgGrad: 'radial-gradient(ellipse 100% 90% at 50% 20%, #0d003a 0%, #04001a 55%, #000 100%)',
    glowOrbs: ['#4DB8FF22', '#C084FC18'],
    symbols: ['◉', '★', '✦', '⬡', '◈', '▲', '∞', '◉'],
  },
} as const;

type ColorScheme = keyof typeof SCHEMES;
type Scheme = typeof SCHEMES[ColorScheme];

// ── Props ─────────────────────────────────────────────────────────────────────
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

// ── Glowing orb background ────────────────────────────────────────────────────
const GlowOrbs: React.FC<{ scheme: Scheme }> = ({ scheme }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const pulse1 = 0.7 + Math.sin(frame * 0.04) * 0.15;
  const pulse2 = 0.7 + Math.sin(frame * 0.035 + 2) * 0.18;
  const drift1X = Math.sin(frame * 0.008) * 60;
  const drift1Y = Math.cos(frame * 0.006) * 40;
  const drift2X = Math.cos(frame * 0.007 + 1) * 55;
  const drift2Y = Math.sin(frame * 0.009 + 3) * 35;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {/* Primary glow orb - top area */}
      <div style={{
        position: 'absolute',
        left: width * 0.5 + drift1X - 350,
        top: height * 0.25 + drift1Y - 350,
        width: 700, height: 700,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${scheme.glowOrbs[0]} 0%, transparent 70%)`,
        transform: `scale(${pulse1})`,
        pointerEvents: 'none',
      }} />
      {/* Secondary glow orb - bottom area */}
      <div style={{
        position: 'absolute',
        left: width * 0.3 + drift2X - 280,
        top: height * 0.7 + drift2Y - 280,
        width: 560, height: 560,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${scheme.glowOrbs[1]} 0%, transparent 70%)`,
        transform: `scale(${pulse2})`,
        pointerEvents: 'none',
      }} />
    </AbsoluteFill>
  );
};

// ── Animated background ───────────────────────────────────────────────────────
const AnimatedBg: React.FC<{ scheme: Scheme; opacity?: number }> = ({ scheme, opacity = 1 }) => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  const scanY = (frame * 3.2) % height;
  return (
    <AbsoluteFill style={{ opacity }}>
      {/* Rich gradient base — NOT pure black */}
      <AbsoluteFill style={{ background: scheme.bgGrad }} />
      {/* Subtle grid overlay */}
      <svg style={{ position: 'absolute', inset: 0, opacity: 0.04 }} width="100%" height="100%">
        <defs>
          <pattern id="ugrid" width="55" height="55" patternUnits="userSpaceOnUse">
            <path d="M55 0L0 0 0 55" fill="none" stroke={scheme.accent} strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#ugrid)" />
      </svg>
      {/* Animated scan line */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: scanY, height: 1,
        background: `linear-gradient(90deg, transparent, ${scheme.accent}44, transparent)`,
      }} />
      <GlowOrbs scheme={scheme} />
    </AbsoluteFill>
  );
};

// ── Matrix digital rain ───────────────────────────────────────────────────────
const MatrixRain: React.FC<{ opacity?: number; scheme: Scheme }> = ({
  opacity = 0.12,
  scheme,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const cols = useMemo(() => {
    const colW = 26;
    const n    = Math.ceil(width / colW);
    return Array.from({ length: n }, (_, i) => ({
      x: i * colW, speed: 1.1 + (i % 7) * 0.45,
      phase: (i * 137) % height, len: 6 + (i % 10),
    }));
  }, [width, height]);

  return (
    <svg
      style={{ position: 'absolute', inset: 0, opacity, pointerEvents: 'none' }}
      width="100%" height="100%"
    >
      {cols.map((col, ci) =>
        Array.from({ length: col.len }, (_, ri) => {
          const y = ((col.phase + frame * col.speed + ri * 28) % (height + 200)) - 100;
          const char = String.fromCharCode(0x30A0 + ((frame * 3 + ci * 7 + ri * 13) % 96));
          const a    = 1 - ri / col.len;
          return (
            <text
              key={`${ci}-${ri}`}
              x={col.x} y={y}
              fill={ri === 0 ? '#FFFFFF' : scheme.matrix}
              fontSize="16" fontFamily="monospace"
              opacity={a * 0.85}
            >
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
  scheme, count = 22, alpha = 1,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const items = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
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
          <div
            key={i}
            style={{
              position: 'absolute', left: p.x, top: y,
              fontSize: p.size, color: p.col,
              opacity: (0.07 + (i % 5) * 0.03) * alpha,
              fontFamily: 'monospace', pointerEvents: 'none',
              textShadow: `0 0 8px ${p.col}`,
            }}
          >
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
    <svg
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity }}
      width="100%" height="100%"
    >
      {Array.from({ length: count }, (_, i) => {
        const a = ((i / count) * 360 + deg) * (Math.PI / 180);
        return (
          <line
            key={i}
            x1={cx + Math.cos(a) * r0} y1={cy + Math.sin(a) * r0}
            x2={cx + Math.cos(a) * r1} y2={cy + Math.sin(a) * r1}
            stroke={color} strokeWidth={i % 3 === 0 ? 2 : 1}
            opacity={0.14 + (i % 4) * 0.06}
          />
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

// ── Pulse ring ────────────────────────────────────────────────────────────────
const PulseRing: React.FC<{ size: number; color: string; speed?: number }> = ({
  size, color, speed = 1,
}) => {
  const frame = useCurrentFrame();
  const scale = 1 + Math.sin(frame * 0.08 * speed) * 0.14;
  const alpha = 0.35 + Math.sin(frame * 0.08 * speed + 1) * 0.2;
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      border: `3px solid ${color}`,
      transform: `scale(${scale})`,
      opacity: alpha,
      boxShadow: `0 0 20px ${color}`,
      position: 'absolute', inset: -10,
    }} />
  );
};

// ── Count-up number ───────────────────────────────────────────────────────────
const CountUp: React.FC<{
  rawValue: string; startF: number; endF: number; scheme: Scheme;
}> = ({ rawValue, startF, endF, scheme }) => {
  const frame = useCurrentFrame();
  const match = rawValue.match(/^([+$€£¥]?)(\d+\.?\d*)([KMBT%]?)$/);
  if (!match) {
    return (
      <div style={{
        fontFamily: bebas, fontSize: 86, color: scheme.accent,
        letterSpacing: 4, lineHeight: 1,
        textShadow: `0 0 30px ${scheme.glow}`,
      }}>{rawValue}</div>
    );
  }
  const [, prefix, numStr, suffix] = match;
  const target  = parseFloat(numStr);
  const prog    = itp(frame, [startF, endF], [0, 1], E.inOut);
  const current = target * prog;
  const display = current < 10 ? current.toFixed(1) : Math.round(current).toString();

  return (
    <div style={{
      fontFamily: bebas, fontSize: 86, color: scheme.accent,
      letterSpacing: 4, lineHeight: 1,
      textShadow: `0 0 35px ${scheme.glow}, 0 0 70px ${scheme.glow}55`,
    }}>
      {prefix}{display}{suffix}
    </div>
  );
};

// ── Scrolling ticker bar ──────────────────────────────────────────────────────
const TickerBar: React.FC<{
  stats: Array<{ label: string; value: string }>;
  hashtags: string[];
  scheme: Scheme;
}> = ({ stats, hashtags, scheme }) => {
  const frame = useCurrentFrame();
  const items = [
    ...stats.map(s => `${s.label}: ${s.value}`),
    ...hashtags.map(h => `#${h.replace(/^#/, '')}`),
    ...stats.map(s => `${s.label}: ${s.value}`),
    ...hashtags.map(h => `#${h.replace(/^#/, '')}`),
  ];
  const itemW   = 240;
  const total   = items.length * itemW;
  const scrollX = -(frame * 2) % total;

  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, height: 52,
      background: `linear-gradient(90deg, ${scheme.bg}ee, ${scheme.bg2}ee)`,
      borderTop: `1px solid ${scheme.accent}55`,
      display: 'flex', alignItems: 'center', overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center',
        transform: `translateX(${scrollX}px)`, whiteSpace: 'nowrap',
      }}>
        {[...items, ...items].map((item, i) => (
          <div key={i} style={{
            width: itemW, display: 'flex', alignItems: 'center',
            padding: '0 16px', flexShrink: 0, gap: 8,
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: scheme.accent, boxShadow: `0 0 8px ${scheme.accent}`,
            }} />
            <span style={{
              fontFamily: orbitron, fontSize: 13, color: scheme.accent,
              letterSpacing: 2,
            }}>{item}</span>
            <span style={{ color: '#444', fontSize: 18, marginLeft: 4 }}>·</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Ken Burns image slide — dynamic zoom+pan with burst on entry ──────────────
const KenBurns: React.FC<{ src: string; duration: number; index: number; scheme: Scheme }> = ({
  src, duration, index, scheme,
}) => {
  const frame   = useCurrentFrame();

  // Each slide has a unique movement signature
  const moves: Array<[number, number, number, number, string]> = [
    [1.0, 1.18, 0,   -30,  'center top'],
    [1.2, 1.0,  30,  0,    'center center'],
    [1.0, 1.2,  -25, 20,   'center bottom'],
    [1.15, 1.0, 0,   30,   'center center'],
    [1.0, 1.22, 20,  -20,  'right top'],
    [1.18, 1.0, -20, 0,    'left center'],
  ];
  const [s0, s1, panX, panY, origin] = moves[index % moves.length];

  // Zoom burst on entry — snaps to scale then eases into main motion
  const burstFrame = Math.min(frame, 12);
  const burstScale = 1 + itp(burstFrame, [0, 12], [0.06, 0], E.out);
  const mainScale  = itp(frame, [0, duration], [s0, s1], E.inOut);
  const scale      = mainScale * burstScale;

  const px = itp(frame, [0, duration], [0, panX], E.inOut);
  const py = itp(frame, [0, duration], [0, panY], E.inOut);

  const edgeFade = Math.min(
    itp(frame, [0, 18], [0, 1], E.out),
    itp(frame, [duration - 18, duration], [1, 0], E.inOut),
  );

  // Subtle color accent pulse on the image
  const accentPulse = 0.03 + Math.sin(frame * 0.07) * 0.01;

  return (
    <AbsoluteFill style={{ overflow: 'hidden', opacity: edgeFade }}>
      <Img
        src={staticFile(src)}
        style={{
          width: '100%', height: '100%', objectFit: 'cover',
          transform: `scale(${scale}) translate(${px}px, ${py}px)`,
          transformOrigin: origin,
        }}
      />
      {/* Neutral cinematic vignette */}
      <AbsoluteFill
        style={{
          background: 'linear-gradient(180deg, rgba(0,0,0,0.32) 0%, rgba(0,0,0,0.0) 28%, rgba(0,0,0,0.0) 60%, rgba(0,0,0,0.78) 100%)',
        }}
      />
      {/* Subtle accent color tint — very faint, just mood */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 80% 60% at 50% 30%, ${scheme.accent}0${Math.round(accentPulse * 100).toString(16).padStart(2,'0')} 0%, transparent 70%)`,
          mixBlendMode: 'screen',
        }}
      />
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
      x: Math.random() * width,
      startY: height * 0.5 + Math.random() * height * 0.4,
      vy: 3 + Math.random() * 10, vx: (Math.random() - 0.5) * 6,
      w: 7 + Math.random() * 13, h: 5 + Math.random() * 8,
      col: cols[i % cols.length], rot0: Math.random() * 360,
      rotV: (Math.random() - 0.5) * 15, delay: Math.floor(Math.random() * 28),
    }));
  }, [width, height, scheme]);

  return (
    <>
      {pieces.map((p, i) => {
        const t = frame - p.delay;
        if (t <= 0) return null;
        const a =
          itp(frame, [p.delay, p.delay + 12], [0, 1]) *
          itp(frame, [p.delay + 55, p.delay + 90], [1, 0]);
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

// ── Emphasis flash — triggers on active highlighted word ──────────────────────
const EmphasisFlash: React.FC<{ active: boolean; scheme: Scheme }> = ({ active, scheme }) => {
  const frame = useCurrentFrame();
  if (!active) return null;
  const alpha = itp(frame % 8, [0, 2], [0.18, 0], E.out);
  return (
    <AbsoluteFill
      style={{
        background: scheme.accent,
        opacity: alpha,
        pointerEvents: 'none',
      }}
    />
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// SCENE 1 — TITLE (0 → TITLE_END)
// ══════════════════════════════════════════════════════════════════════════════
const SceneTitle: React.FC<{
  titleCard: { headline: string; subline: string };
  topic: string;
  scheme: Scheme;
}> = ({ titleCard, topic, scheme }) => {
  const frame  = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const chipSpring     = useSpringIn(8,  { damping: 18, stiffness: 110 });
  const headlineSpring = useSpringIn(20, { damping: 14, stiffness: 80  });
  const runSpring      = useSpringIn(36, { damping: 14, stiffness: 80  });
  const lineW          = itp(frame, [46, 92], [0, 320], E.out);
  const subSpring      = useSpringIn(60, { damping: 20, stiffness: 120 });
  const glow           = 28 + Math.sin(frame * 0.09) * 14;

  const words = titleCard.headline.split(' ');
  const half  = Math.ceil(words.length / 2);
  const line1 = words.slice(0, half).join(' ');
  const line2 = words.slice(half).join(' ');

  // Pulsing circle backdrop behind headline
  const bgCircleScale = 1 + Math.sin(frame * 0.05) * 0.08;

  return (
    <AbsoluteFill style={{
      alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 0,
    }}>
      <MatrixRain opacity={0.11} scheme={scheme} />
      <Particles scheme={scheme} count={28} alpha={0.9} />
      <Rays cx={width / 2} cy={height * 0.42} r0={120} r1={520} count={22}
        color={scheme.accent} rpm={0.42} opacity={0.16} />

      {/* Glowing circle behind headline */}
      <div style={{
        position: 'absolute',
        left: width / 2 - 260, top: height * 0.3,
        width: 520, height: 280,
        borderRadius: '50%',
        background: `radial-gradient(ellipse, ${scheme.accent}15 0%, transparent 70%)`,
        transform: `scale(${bgCircleScale})`,
        pointerEvents: 'none',
      }} />

      <LensFlare triggerFrame={22} duration={38} color={scheme.accent} />

      {/* Topic chip */}
      <div style={{
        opacity: Math.min(chipSpring * 2, 1),
        transform: `translateY(${(1 - chipSpring) * 30}px)`,
        padding: '8px 24px', borderRadius: 30,
        border: `1px solid ${scheme.accent}88`,
        background: `${scheme.accent}22`,
        fontFamily: orbitron, fontSize: 16,
        color: scheme.accent, letterSpacing: 4,
        textTransform: 'uppercase',
        marginBottom: 22,
        boxShadow: `0 0 22px ${scheme.accent}44, inset 0 0 14px ${scheme.accent}11`,
      }}>
        {topic}
      </div>

      {/* Line 1 — slides from left */}
      <ChromaText
        text={line1}
        aberration={4}
        style={{
          opacity: Math.min(headlineSpring, 1),
          transform: `translateX(${(1 - headlineSpring) * -440}px)`,
          fontFamily: bebas, fontSize: 122, color: scheme.accent,
          letterSpacing: 8, lineHeight: 1,
          textShadow: `0 0 ${glow}px ${scheme.glow}, 0 0 65px ${scheme.glow}55`,
          display: 'block',
        }}
      />

      {/* Line 2 — slides from right */}
      {line2 && (
        <div style={{
          opacity: Math.min(runSpring, 1),
          transform: `translateX(${(1 - runSpring) * 440}px)`,
          fontFamily: bebas, fontSize: 122, color: scheme.text,
          letterSpacing: 8, lineHeight: 1,
          textShadow: `0 0 30px rgba(255,255,255,0.5)`,
        }}>
          {line2}
        </div>
      )}

      {/* Expanding accent bar */}
      <div style={{
        width: lineW, height: 3, marginTop: 16,
        background: `linear-gradient(90deg, transparent, ${scheme.accent}, ${scheme.secondary}, ${scheme.accent}, transparent)`,
        boxShadow: `0 0 16px ${scheme.accent}`,
      }} />

      {/* Subline */}
      <div style={{
        opacity: Math.min(subSpring * 2, 1),
        transform: `translateY(${(1 - subSpring) * 30}px)`,
        fontFamily: orbitron, fontSize: 23,
        color: scheme.secondary, letterSpacing: 3,
        textAlign: 'center', marginTop: 18, padding: '0 52px',
        textShadow: `0 0 16px ${scheme.secondary}66`,
      }}>
        {titleCard.subline}
      </div>

      {/* Bottom accent line */}
      <div style={{
        position: 'absolute', bottom: 80, left: '10%', right: '10%',
        height: 1,
        background: `linear-gradient(90deg, transparent, ${scheme.accent}66, transparent)`,
        opacity: Math.min(subSpring * 2, 1),
      }} />
    </AbsoluteFill>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// SCENE 2 — B-ROLL + CAPTIONS
// ══════════════════════════════════════════════════════════════════════════════
const SceneBroll: React.FC<{
  brollClips: string[];
  imageSlides: string[];
  captions: Caption[];
  stats: Array<{ label: string; value: string }>;
  hashtags: string[];
  scheme: Scheme;
  sceneDuration: number;
  absoluteFrame: number;   // global video frame — needed for caption↔audio sync
}> = ({ brollClips, imageSlides, captions, stats, hashtags, scheme, sceneDuration, absoluteFrame }) => {
  const frame = useCurrentFrame();  // sequence-local frame (for visuals)
  const { fps, width } = useVideoConfig();

  const { pages } = useMemo(() => {
    if (!captions.length) return { pages: [] };
    return createTikTokStyleCaptions({ captions, combineTokensWithinMilliseconds: 1800 });
  }, [captions]);

  // IMPORTANT: use absoluteFrame for caption timing so it stays in sync with audio,
  // which always plays from global frame 0.
  const currentMs   = (absoluteFrame / fps) * 1000;
  const activePage  = pages.find(
    p => p.startMs <= currentMs && p.startMs + p.durationMs > currentMs,
  );
  const activeToken = activePage?.tokens.find(
    t => t.fromMs <= currentMs && t.toMs > currentMs,
  );

  // Caption pop-in — based on absolute frame vs page start
  const pageStartFrame = activePage ? Math.round((activePage.startMs / 1000) * fps) : 0;
  const captionAge     = absoluteFrame - pageStartFrame;
  const captionScale   = itp(captionAge, [0, 8], [0.88, 1], E.pop);
  const captionAlpha   = itp(captionAge, [0, 5], [0, 1]);

  // Detect if active word is a number/stat (for emphasis flash)
  const isStatWord = activeToken ? /\d/.test(activeToken.text) : false;

  const clipDuration =
    brollClips.length > 0 ? Math.floor(sceneDuration / brollClips.length) : sceneDuration;

  return (
    <AbsoluteFill>
      {/* Background — priority: broll > images > animated fallback */}
      {brollClips.length > 0 ? (
        brollClips.map((clip, i) => (
          <Sequence key={clip} from={i * clipDuration} durationInFrames={clipDuration + 2}>
            <Video
              src={staticFile(clip)}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <AbsoluteFill style={{ background: 'rgba(0,0,0,0.2)' }} />
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
          <MatrixRain opacity={0.1} scheme={scheme} />
        </>
      )}

      {/* Emphasis flash on stat/important words */}
      <EmphasisFlash active={isStatWord} scheme={scheme} />

      <Particles scheme={scheme} count={12} alpha={0.45} />

      {/* Gradient scrim for caption legibility */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 400,
        background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.1) 75%, transparent 100%)',
        pointerEvents: 'none',
      }} />

      {/* Word-highlighted captions — TikTok style */}
      {activePage && (
        <div style={{
          position: 'absolute', bottom: 72, left: '3%', right: '3%',
          textAlign: 'center', padding: '10px 20px',
          opacity: captionAlpha,
          transform: `scale(${captionScale})`,
        }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>
            {activePage.tokens.map((token, i) => {
              const isActive = token === activeToken;
              // Scale up stat words extra for emphasis
              const isNum = /\d/.test(token.text);
              return (
                <span
                  key={i}
                  style={{
                    fontFamily: bebas,
                    fontSize: isActive ? (isNum ? 78 : 72) : 64,
                    color: isActive ? scheme.accent : scheme.text,
                    letterSpacing: 2,
                    lineHeight: 1.15,
                    textShadow: isActive
                      ? `0 0 28px ${scheme.accent}, 0 0 56px ${scheme.accent}88, 2px 2px 0 #000, -2px -2px 0 #000`
                      : `2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000`,
                    transform: isActive ? 'scale(1.08) translateY(-2px)' : 'scale(1)',
                    display: 'inline-block',
                    transition: 'none',
                  }}
                >
                  {token.text}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <TickerBar stats={stats} hashtags={hashtags} scheme={scheme} />
    </AbsoluteFill>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// SCENE 3 — STATS (overlay over broll — more transparent now)
// ══════════════════════════════════════════════════════════════════════════════
const SceneStats: React.FC<{
  stats: Array<{ label: string; value: string }>;
  scheme: Scheme;
}> = ({ stats, scheme }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const hdrA = itp(frame, [0, 22], [0, 1]);
  const hdrY = itp(frame, [0, 22], [-44, 0], E.out);

  return (
    <AbsoluteFill style={{
      flexDirection: 'column', alignItems: 'center',
      paddingTop: 55, gap: 16,
    }}>
      {/* Semi-transparent colored backdrop (NOT pitch black) */}
      <AbsoluteFill style={{
        background: `linear-gradient(160deg, ${scheme.bg}e8 0%, ${scheme.bg2}cc 100%)`,
      }} />
      <GlowOrbs scheme={scheme} />
      <MatrixRain opacity={0.07} scheme={scheme} />
      <Particles scheme={scheme} count={14} alpha={0.5} />
      <Rays cx={width / 2} cy={height * 0.5} r0={90} r1={540}
        count={26} color={scheme.accent} rpm={0.32} opacity={0.12} />

      {/* Header */}
      <div style={{ opacity: hdrA, transform: `translateY(${hdrY}px)`, marginBottom: 8 }}>
        <GlitchText text="BY THE NUMBERS" size={70} color={scheme.accent} />
      </div>

      {stats.map((stat, i) => {
        const delay = i * 24;
        const alpha  = itp(frame, [delay, delay + 24], [0, 1]);
        const slideX = itp(frame, [delay, delay + 24], [-90, 0], E.out);
        const barW   = itp(frame, [delay + 14, delay + 90], [0, 100], E.inOut);

        return (
          <div
            key={i}
            style={{
              opacity: alpha, transform: `translateX(${slideX}px)`,
              width: '87%', padding: '18px 24px',
              background: `linear-gradient(100deg, ${scheme.accent}25 0%, ${scheme.bg2}aa 100%)`,
              borderRadius: 20,
              border: `1px solid ${scheme.accent}66`,
              boxShadow: `0 0 24px ${scheme.accent}22, inset 0 0 20px ${scheme.accent}08`,
              position: 'relative', overflow: 'hidden',
            }}
          >
            {/* Animated fill bar */}
            <div style={{
              position: 'absolute', inset: 0, left: 0,
              width: `${barW}%`,
              background: `${scheme.accent}12`, borderRadius: 20,
            }} />

            <div style={{
              position: 'relative', zIndex: 1,
              display: 'flex', flexDirection: 'column', gap: 4,
            }}>
              <div style={{
                fontFamily: orbitron, fontSize: 13,
                color: scheme.secondary, letterSpacing: 3,
                textTransform: 'uppercase',
                textShadow: `0 0 8px ${scheme.secondary}88`,
              }}>
                {stat.label}
              </div>

              <div style={{ position: 'relative', display: 'inline-block' }}>
                <PulseRing size={86} color={scheme.accent} speed={0.9 + i * 0.2} />
                <CountUp rawValue={stat.value} startF={delay + 5} endF={delay + 95} scheme={scheme} />
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

  const ctaSpring  = useSpringIn(0,  { damping: 14, stiffness: 80 });
  const hashAlpha  = itp(frame, [44, 78], [0, 1]);
  const hashY      = itp(frame, [44, 78], [28, 0], E.out);
  const glow       = 24 + Math.sin(frame * 0.13) * 16;

  return (
    <AbsoluteFill style={{
      alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 32,
    }}>
      {/* Vibrant animated background for finale — not black */}
      <AnimatedBg scheme={scheme} />
      <MatrixRain opacity={0.1} scheme={scheme} />
      <Particles scheme={scheme} count={36} alpha={0.85} />
      <Confetti scheme={scheme} />
      <Rays cx={width / 2} cy={height / 2} r0={65} r1={680}
        count={30} color={scheme.accent} rpm={0.55} opacity={0.18} />

      <LensFlare triggerFrame={5} duration={40} color={scheme.secondary} />

      {/* Glowing circle around CTA */}
      <div style={{
        position: 'absolute',
        left: width / 2 - 300, top: height / 2 - 200,
        width: 600, height: 400,
        borderRadius: '50%',
        background: `radial-gradient(ellipse, ${scheme.accent}20 0%, transparent 65%)`,
        pointerEvents: 'none',
      }} />

      {/* CTA — spring pop */}
      <div style={{
        opacity: Math.min(ctaSpring * 2, 1),
        transform: `scale(${0.15 + ctaSpring * 0.85})`,
        textAlign: 'center', padding: '0 44px', position: 'relative',
      }}>
        <ChromaText
          text={cta}
          aberration={5}
          style={{
            fontFamily: bebas, fontSize: 95, letterSpacing: 7, lineHeight: 1.08,
            background: scheme.grad,
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            display: 'block',
            filter: `drop-shadow(0 0 ${glow}px ${scheme.glow})`,
          }}
        />
      </div>

      {/* Hashtags */}
      <div style={{
        opacity: hashAlpha,
        transform: `translateY(${hashY}px)`,
        fontFamily: orbitron, fontSize: 20,
        color: scheme.accent, letterSpacing: 3, textAlign: 'center',
        textShadow: `0 0 14px ${scheme.accent}`,
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

  // ── Scene timing — designed for 50-60s videos ───────────────────────────────
  const FADE          = 24;
  const TITLE_END     = 210;                            // 7s title
  const HAS_STATS     = stats.length > 0;
  // Stats appear at ~55% of video duration (mid-video)
  const STATS_START   = Math.floor(durationInFrames * 0.52);
  const STATS_DUR     = 175;
  const STATS_END     = STATS_START + STATS_DUR;
  // Finale: last 5s
  const FINALE_START  = durationInFrames - 155;

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

      {/* Base animated background always visible */}
      <AnimatedBg scheme={scheme} />

      {/* Scene 1 — Title */}
      <div style={{ position: 'absolute', inset: 0, opacity: titleAlpha }}>
        <Sequence from={0} durationInFrames={TITLE_END + FADE}>
          <SceneTitle titleCard={titleCard} topic={topic} scheme={scheme} />
        </Sequence>
      </div>

      {/* Scene 2 — B-roll + captions */}
      <div style={{ position: 'absolute', inset: 0, opacity: brollAlpha }}>
        <Sequence
          from={TITLE_END - FADE}
          durationInFrames={FINALE_START - (TITLE_END - FADE) + FADE}
        >
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

      {/* Scene 3 — Stats overlay */}
      {HAS_STATS && (
        <div style={{ position: 'absolute', inset: 0, opacity: statsAlpha }}>
          <Sequence from={STATS_START} durationInFrames={STATS_DUR}>
            <SceneStats stats={stats} scheme={scheme} />
          </Sequence>
        </div>
      )}

      {/* Scene 4 — Finale */}
      <div style={{ position: 'absolute', inset: 0, opacity: finaleAlpha }}>
        <Sequence
          from={FINALE_START - FADE}
          durationInFrames={durationInFrames - (FINALE_START - FADE)}
        >
          <SceneFinale cta={cta} hashtags={hashtags} scheme={scheme} />
        </Sequence>
      </div>

      {/* ── FX stack ──────────────────────────────────────────────── */}
      <CinematicColorGrade intensity={0.16} />
      <FilmGrain opacity={0.038} speed={3} />
      <Vignette strength={0.44} />

      <LensFlare triggerFrame={TITLE_END} duration={38} color={scheme.accent} />
      {HAS_STATS && (
        <LensFlare triggerFrame={STATS_START} duration={32} color={scheme.secondary} />
      )}
      <LensFlare triggerFrame={FINALE_START} duration={38} color={scheme.secondary} />

      {/* ── Audio ─────────────────────────────────────────────────── */}
      {audioFile && (
        <Audio
          src={staticFile(audioFile)}
          volume={(f) =>
            interpolate(f, [0, 14], [0, 0.95], { extrapolateRight: 'clamp' })
          }
        />
      )}
    </div>
  );
};
