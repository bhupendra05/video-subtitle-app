import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import type { TikTokPage } from '@remotion/captions';

const HIGHLIGHT = '#FFDE59';
const BASE      = '#FFFFFF';
const SHADOW    = '0 2px 12px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.6)';

export const CaptionPage: React.FC<{ page: TikTokPage }> = ({ page }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentMs  = (frame / fps) * 1000;
  const absoluteMs = page.startMs + currentMs;

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: 64,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          fontSize: 56,
          fontWeight: 800,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          whiteSpace: 'pre',
          textAlign: 'center',
          lineHeight: 1.25,
          maxWidth: '86%',
          textShadow: SHADOW,
          letterSpacing: '-0.5px',
        }}
      >
        {page.tokens.map((token) => {
          const isActive = token.fromMs <= absoluteMs && token.toMs > absoluteMs;
          return (
            <span
              key={token.fromMs}
              style={{ color: isActive ? HIGHLIGHT : BASE }}
            >
              {token.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
