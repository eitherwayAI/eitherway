import styles from './Landing.module.scss';
import { CornerDecorations } from './CornerDecorations';
import { LastWorksCard } from './LastWorksCard';
import { useSlider } from './useSlider';

export function LeftSidebar() {
  const { activeSlide, isTransitioning, handleDotClick, handleMouseEnter, handleMouseLeave } = useSlider();

  return (
    <div className={styles['left-sidebar']}>
      <a href="/" rel="noopener noreferrer" className={styles['whitepaper-card']}>
        <CornerDecorations />
        <div className={styles['card-content']}>
          <img src="/icons/whitepaper.svg" alt="Whitepaper" />
          <span>DOCS</span>
        </div>
      </a>
      <LastWorksCard
        activeSlide={activeSlide}
        isTransitioning={isTransitioning}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onDotClick={handleDotClick}
      />
    </div>
  );
}
