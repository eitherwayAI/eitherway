import styles from './Landing.module.scss';

interface PhoneSliderProps {
  activeSlide: number;
  isTransitioning: boolean;
}

export function PhoneSlider({ activeSlide, isTransitioning }: PhoneSliderProps) {
  return (
    <div className={styles['phone-slider']}>
      <div className={styles['phone-track']}>
        <div
          className={`${styles['phone-slide']} ${activeSlide === 0 ? styles.active : ''} ${isTransitioning ? styles.transitioning : ''}`}
        >
          <img src="/icons/phones/phone-01.png" alt="Phone 1" />
        </div>
        <div
          className={`${styles['phone-slide']} ${activeSlide === 1 ? styles.active : ''} ${isTransitioning ? styles.transitioning : ''}`}
        >
          <img src="/icons/phones/phone-02.png" alt="Phone 2" />
        </div>
        <div
          className={`${styles['phone-slide']} ${activeSlide === 2 ? styles.active : ''} ${isTransitioning ? styles.transitioning : ''}`}
        >
          <img src="/icons/phones/phone-03.png" alt="Phone 3" />
        </div>
      </div>
    </div>
  );
}
