import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { VideoWithSubtitles, type VideoProps } from './VideoWithSubtitles';
import { CryptoBullRun } from './CryptoBullRun';
import { UniversalShort, type UniversalShortProps } from './UniversalShort';
import type { CalculateMetadataFunction } from 'remotion';

const calculateMetadata: CalculateMetadataFunction<VideoProps> = async ({ props }) => ({
  width:            props.width,
  height:           props.height,
  fps:              props.fps,
  durationInFrames: props.durationInFrames,
});

const calculateShortMetadata: CalculateMetadataFunction<UniversalShortProps> = async ({ props }) => ({
  width:            1080,
  height:           1920,
  fps:              props.fps ?? 30,
  durationInFrames: props.durationInFrames,
});

const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="VideoWithSubtitles"
      component={VideoWithSubtitles}
      calculateMetadata={calculateMetadata}
      defaultProps={{
        videoFile:        'uploads/placeholder.mp4',
        audioFile:        'audio/placeholder.mp3',
        captionsFile:     'captions/placeholder.json',
        durationInFrames: 300,
        width:            1920,
        height:           1080,
        fps:              30,
      }}
    />
    <Composition
      id="CryptoBullRun2026"
      component={CryptoBullRun}
      durationInFrames={1110}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="UniversalShort"
      component={UniversalShort}
      calculateMetadata={calculateShortMetadata}
      defaultProps={{
        topic: 'AI & Future',
        audioFile: '',
        captionsFile: '',
        brollClips: [],
        imageSlides: [],
        colorScheme: 'cyber-green',
        titleCard: { headline: 'THE FUTURE IS NOW', subline: 'Everything is changing' },
        cta: 'FOLLOW FOR MORE',
        hashtags: ['AI', 'Future', 'Tech'],
        stats: [],
        durationInFrames: 900,
        fps: 30,
      } satisfies UniversalShortProps}
    />
  </>
);

registerRoot(RemotionRoot);
