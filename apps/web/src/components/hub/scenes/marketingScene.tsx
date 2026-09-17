import { SceneFrame, SceneNode } from './SceneFrame';
import styles from '../HubScene.module.css';

export function MarketingScene() {
  return (
    <SceneFrame labels={['Campañas', 'Audiencias']}>
      <path className={styles.connection} pathLength={1} d="M164 60H188V33H210" />
      <path className={styles.connection} pathLength={1} d="M188 60V87H210" />
      <SceneNode step={0}>
        <rect x={154} y={55} width={10} height={10} rx={1} />
      </SceneNode>
      <SceneNode step={2}>
        <rect x={210} y={28} width={20} height={10} rx={1} />
        <path className={styles.secondary} d="M214 33H226" />
      </SceneNode>
      <SceneNode step={5}>
        <rect x={210} y={82} width={20} height={10} rx={1} />
        <path className={styles.secondary} d="M214 87H226" />
      </SceneNode>
    </SceneFrame>
  );
}
