import { SceneFrame, SceneNode } from './SceneFrame';
import styles from '../HubScene.module.css';

export function OperacionesScene() {
  return (
    <SceneFrame labels={['Tareas', 'Recursos']}>
      <path className={styles.connection} pathLength={1} d="M9 18.5H40" />
      <path className={styles.connection} pathLength={1} d="M44.5 23V42.5H84" />
      <SceneNode step={0}>
        <rect x={0} y={14} width={9} height={9} rx={2} />
      </SceneNode>
      <SceneNode step={1}>
        <rect x={40} y={14} width={9} height={9} rx={2} />
      </SceneNode>
      <SceneNode step={2}>
        <rect x={84} y={38} width={9} height={9} rx={2} />
      </SceneNode>
    </SceneFrame>
  );
}
