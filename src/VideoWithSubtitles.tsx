import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  AbsoluteFill,
  Audio,
  Video,
  Sequence,
  staticFile,
  useVideoConfig,
  useDelayRender,
  continueRender,
  cancelRender,
  delayRender,
} from 'remotion';
import { createTikTokStyleCaptions } from '@remotion/captions';
import type { Caption } from '@remotion/captions';
import { CaptionPage } from './CaptionPage';

export type VideoProps = {
  videoFile: string;
  audioFile: string;
  captionsFile: string;
  durationInFrames: number;
  width: number;
  height: number;
  fps: number;
};

const SWITCH_EVERY_MS = 1500;

export const VideoWithSubtitles: React.FC<VideoProps> = ({
  videoFile,
  audioFile,
  captionsFile,
}) => {
  const { fps } = useVideoConfig();
  const [captions, setCaptions] = useState<Caption[] | null>(null);
  const [handle] = useState(() => delayRender('Loading captions'));

  const fetchCaptions = useCallback(async () => {
    try {
      const res  = await fetch(staticFile(captionsFile));
      const data = await res.json();
      setCaptions(data);
      continueRender(handle);
    } catch (e) {
      cancelRender(e);
    }
  }, [captionsFile, handle]);

  useEffect(() => { fetchCaptions(); }, [fetchCaptions]);

  const { pages } = useMemo(() => {
    if (!captions) return { pages: [] };
    return createTikTokStyleCaptions({
      captions,
      combineTokensWithinMilliseconds: SWITCH_EVERY_MS,
    });
  }, [captions]);

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {/* Original video, audio muted — ElevenLabs audio replaces it */}
      <Video src={staticFile(videoFile)} style={{ width: '100%', height: '100%' }} muted />
      <Audio src={staticFile(audioFile)} />

      {/* TikTok-style word-highlighted captions */}
      {pages.map((page, i) => {
        const nextPage = pages[i + 1] ?? null;
        const startFrame = (page.startMs / 1000) * fps;
        const endFrame   = Math.min(
          nextPage ? (nextPage.startMs / 1000) * fps : Infinity,
          startFrame + (SWITCH_EVERY_MS / 1000) * fps,
        );
        const dur = endFrame - startFrame;
        if (dur <= 0) return null;
        return (
          <Sequence key={i} from={startFrame} durationInFrames={dur}>
            <CaptionPage page={page} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
