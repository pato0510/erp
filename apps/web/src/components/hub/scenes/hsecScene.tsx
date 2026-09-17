import { SceneFrame, SceneNode } from './SceneFrame';
import styles from '../HubScene.module.css';

export function HsecScene() {
  return (
    <SceneFrame labels={['Riesgos', 'Controles']}>
      <path
        className={styles.secondary}
        d="M150 26H230M150 43H230M150 60H230M150 77H230M150 94H230M163 26V94M180 26V94M197 26V94M214 26V94"
        opacity={0.35}
      />
      <path className={styles.connection} pathLength={1} d="M163 43L197 77L222 43Z" />
      <SceneNode step={0}>
        <rect className={styles.point} x={161} y={41} width={4} height={4} />
      </SceneNode>
      <SceneNode step={2}>
        <rect className={styles.point} x={195} y={75} width={4} height={4} />
      </SceneNode>
      <SceneNode step={5}>
        <rect className={styles.point} x={220} y={41} width={4} height={4} />
      </SceneNode>
    </SceneFrame>
  );
}
