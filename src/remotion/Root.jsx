import React from 'react';
import { Composition } from 'remotion';
import { Episode } from './Episode.jsx';
import { Recipe, recipeDurationInFrames } from './Recipe.jsx';
import { FPS, WIDTH, HEIGHT, episodeDurationInFrames } from './timing.js';

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="Episode"
        component={Episode}
        durationInFrames={FPS * 60}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{
          episode: null,
          characters: [],
          assetBase: '',
          musicFile: null,
          seriesTitle: '',
          studio: null,
          studioBase: '',
          noOutroCard: false,
          cta: '',
        }}
        calculateMetadata={({ props }) => ({
          durationInFrames: episodeDurationInFrames(
            props.episode,
            props.studio,
            props.noOutroCard,
            props.cta,
          ),
        })}
      />
      {/* Recettes : titres, liste d'ingrédients, étapes numérotées, carte de fin. */}
      <Composition
        id="Recipe"
        component={Recipe}
        durationInFrames={FPS * 60}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{
          episode: null,
          assetBase: '',
          musicFile: null,
          studio: null,
          studioBase: '',
        }}
        calculateMetadata={({ props }) => ({
          durationInFrames: recipeDurationInFrames(props.episode, props.studio),
        })}
      />
    </>
  );
};
