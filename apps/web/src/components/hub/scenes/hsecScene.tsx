import { SceneFrame, SceneNode } from './SceneFrame';
import styles from '../HubScene.module.css';

export function HsecScene() {
  return (
    <SceneFrame labels={['Riesgos', 'Controles']}>
      <path
        className={styles.secondary}
        d="M16 4H96V48H16ZM42.7 4V48M69.3 4V48M16 26H96"
        opacity={0.35}
      />
      <path className={styles.connection} pathLength={1} d="M16 38L44 18L92 38" />
      <SceneNode step={0}>
        <circle className={styles.point} cx={16} cy={38} r={2} />
      </SceneNode>
      <SceneNode step={1}>
        <circle className={styles.point} cx={44} cy={18} r={2} />
      </SceneNode>
      <SceneNode step={2}>
        <circle className={styles.point} cx={92} cy={38} r={2} />
      </SceneNode>
    </SceneFrame>
  );
}
