import React from 'react';
import { Composition } from 'remotion';
import { VideoWithSubtitles, type VideoProps } from './VideoWithSubtitles';
import type { CalculateMetadataFunction } from 'remotion';

const calculateMetadata: CalculateMetadataFunction<VideoProps> = async ({ props }) => ({
  width:            props.width,
  height:           props.height,
  fps:              props.fps,
  durationInFrames: props.durationInFrames,
});

export const RemotionRoot: React.FC = () => (
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
);
