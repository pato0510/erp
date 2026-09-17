import { SceneFrame, SceneNode } from './SceneFrame';
import styles from '../HubScene.module.css';

const PEOPLE = [
  { x: 190, y: 30 },
  { x: 173, y: 56 },
  { x: 218, y: 56 },
  { x: 158, y: 86 },
  { x: 187, y: 86 },
  { x: 218, y: 86 },
];

export function RrhhScene() {
  return (
    <SceneFrame labels={['Personas', 'Talento']}>
      <path className={styles.connection} pathLength={1} d="M190 34V43H173V52M190 43H218V52" />
      <path className={styles.connection} pathLength={1} d="M173 60V71H158V82M173 71H187V82" />
      <path className={styles.connection} pathLength={1} d="M218 60V82" />
      {PEOPLE.map(({ x, y }, index) => (
        <SceneNode key={`${x}-${y}`} step={index}>
          <rect x={x - 5} y={y - 4} width={10} height={8} rx={1} />
          <path className={styles.secondary} d={`M${x - 3} ${y}h6`} />
        </SceneNode>
      ))}
    </SceneFrame>
  );
}
