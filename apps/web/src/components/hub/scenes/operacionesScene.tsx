import { SceneFrame, SceneNode } from './SceneFrame';
import styles from '../HubScene.module.css';

export function OperacionesScene() {
  return (
    <SceneFrame labels={['Tareas', 'Recursos']}>
      <path className={styles.connection} pathLength={1} d="M176 34H192V58H207" />
      <path className={styles.connection} pathLength={1} d="M218 64V88H198" />
      <SceneNode step={0}>
        <rect x={154} y={28} width={22} height={12} rx={1} />
        <path className={styles.secondary} d="M159 34H171" />
      </SceneNode>
      <SceneNode step={2}>
        <rect x={207} y={52} width={22} height={12} rx={1} />
        <path className={styles.secondary} d="M212 58H224" />
      </SceneNode>
      <SceneNode step={5}>
        <rect x={176} y={82} width={22} height={12} rx={1} />
        <path className={styles.secondary} d="M181 88H193" />
      </SceneNode>
    </SceneFrame>
  );
}
