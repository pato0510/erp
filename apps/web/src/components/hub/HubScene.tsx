'use client';

import { memo } from 'react';
import { ComercialScene } from './scenes/comercialScene';
import { FinanzasScene } from './scenes/finanzasScene';
import { GestionScene } from './scenes/gestionScene';
import { HsecScene } from './scenes/hsecScene';
import { MarketingScene } from './scenes/marketingScene';
import { OperacionesScene } from './scenes/operacionesScene';
import { RrhhScene } from './scenes/rrhhScene';
import styles from './HubScene.module.css';

const SCENES = {
  finanzas: FinanzasScene,
  operaciones: OperacionesScene,
  hsec: HsecScene,
  comercial: ComercialScene,
  marketing: MarketingScene,
  rrhh: RrhhScene,
  gestion: GestionScene,
};

export type HubModuleKey = keyof typeof SCENES;

interface HubSceneProps {
  moduleKey: HubModuleKey;
  playing: boolean;
}

// Removing/reapplying the playing class replays the CSS sequence. The default
// composition is already complete; there are no timers or idle animations.
export const HubScene = memo(function HubScene({ moduleKey, playing }: HubSceneProps) {
  const Scene = SCENES[moduleKey];

  return (
    <div aria-hidden="true" className={`${styles.scene}${playing ? ` ${styles.playing}` : ''}`}>
      <Scene />
    </div>
  );
});
