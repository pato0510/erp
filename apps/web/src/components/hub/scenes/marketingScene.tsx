import { SceneFrame, SceneNode } from './SceneFrame';
import styles from '../HubScene.module.css';

export function MarketingScene() {
  return (
    <SceneFrame labels={['Campañas', 'Audiencias']}>
      <path className={styles.connection} pathLength={1} d="M2 30H26L34 16L44 40L56 24" />
      <path className={styles.connection} pathLength={1} d="M56 24L94 4" />
      <path className={styles.connection} pathLength={1} d="M56 24L94 48" />
      <SceneNode step={0}>
        <circle className={styles.point} cx={2} cy={30} r={2} />
      </SceneNode>
      <SceneNode step={1}>
        <circle className={styles.point} cx={94} cy={4} r={2} />
      </SceneNode>
      <SceneNode step={2}>
        <circle className={styles.point} cx={94} cy={48} r={2} />
      </SceneNode>
    </SceneFrame>
  );
}
