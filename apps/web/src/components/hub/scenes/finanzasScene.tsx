import { SceneFrame, SceneNode } from './SceneFrame';
import styles from '../HubScene.module.css';

export function FinanzasScene() {
  return (
    <SceneFrame labels={['Flujo de caja', 'Balance']}>
      <path className={styles.connection} pathLength={1} d="M0 10H34L62 42H96" />
      <path className={styles.connection} pathLength={1} d="M0 26H96" />
      <path className={styles.connection} pathLength={1} d="M0 42H34L62 10H96" />
      <SceneNode step={0}>
        <circle className={styles.point} cx={34} cy={10} r={2} />
      </SceneNode>
      <SceneNode step={1}>
        <circle className={styles.point} cx={62} cy={42} r={2} />
      </SceneNode>
    </SceneFrame>
  );
}
