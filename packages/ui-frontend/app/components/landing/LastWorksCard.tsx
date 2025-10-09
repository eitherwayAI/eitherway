import styles from './Landing.module.scss';
import { PhoneSlider } from './PhoneSlider';

interface LastWorksCardProps {
  activeSlide: number;
  isTransitioning: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onDotClick: (slideIndex: number) => void;
}

export function LastWorksCard({
  activeSlide,
  isTransitioning,
  onMouseEnter,
  onMouseLeave,
  onDotClick,
}: LastWorksCardProps) {
  return (
    <div className={styles['last-works-card']} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <h3>LATEST APP IDEAS</h3>
      <div className={styles['text-slider']}>
        <p
          className={`${styles['app-name']} ${activeSlide === 0 ? styles.active : ''} ${isTransitioning ? styles.transitioning : ''}`}
        >
          Fitness app
        </p>
        <p
          className={`${styles['app-name']} ${activeSlide === 1 ? styles.active : ''} ${isTransitioning ? styles.transitioning : ''}`}
        >
          Wallet app
        </p>
        <p
          className={`${styles['app-name']} ${activeSlide === 2 ? styles.active : ''} ${isTransitioning ? styles.transitioning : ''}`}
        >
          Chat app
        </p>
      </div>
      <div className={styles['dots-indicator']}>
        <button
          className={`${styles.dot} ${activeSlide === 0 ? styles.active : ''}`}
          onClick={() => onDotClick(0)}
        ></button>
        <button
          className={`${styles.dot} ${activeSlide === 1 ? styles.active : ''}`}
          onClick={() => onDotClick(1)}
        ></button>
        <button
          className={`${styles.dot} ${activeSlide === 2 ? styles.active : ''}`}
          onClick={() => onDotClick(2)}
        ></button>
      </div>
      <PhoneSlider activeSlide={activeSlide} isTransitioning={isTransitioning} />
    </div>
  );
}
