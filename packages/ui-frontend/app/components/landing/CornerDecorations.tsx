import styles from './Landing.module.scss';

export function CornerDecorations() {
  return (
    <div className={styles['card-corners']}>
      <svg className={`${styles.corner} ${styles['corner-tl']}`} width="17" height="17" viewBox="0 0 17 17" fill="none">
        <path d="M1 17V9C1 4.58172 4.58172 1 9 1H17" stroke="black" strokeOpacity="0.3" strokeWidth="2" />
      </svg>
      <svg className={`${styles.corner} ${styles['corner-tr']}`} width="17" height="17" viewBox="0 0 17 17" fill="none">
        <path d="M16 17V9C16 4.58172 12.4183 1 8 1H0" stroke="black" strokeOpacity="0.3" strokeWidth="2" />
      </svg>
      <svg className={`${styles.corner} ${styles['corner-bl']}`} width="17" height="17" viewBox="0 0 17 17" fill="none">
        <path d="M1 0V8C1 12.4183 4.58172 16 9 16H17" stroke="black" strokeOpacity="0.3" strokeWidth="2" />
      </svg>
      <svg className={`${styles.corner} ${styles['corner-br']}`} width="17" height="17" viewBox="0 0 17 17" fill="none">
        <path d="M16 0V8C16 12.4183 12.4183 16 8 16H0" stroke="black" strokeOpacity="0.3" strokeWidth="2" />
      </svg>
    </div>
  );
}
