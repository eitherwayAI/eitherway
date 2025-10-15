import { useEffect, useState } from 'react';

export function useSlider() {
  const [activeSlide, setActiveSlide] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [userInteracted, setUserInteracted] = useState(false);
  const [isPageVisible, setIsPageVisible] = useState(true);

  useEffect(() => {
    if (isHovered || userInteracted || !isPageVisible) {
      return;
    }

    const interval = setInterval(() => {
      void setIsTransitioning(true);
      setTimeout(() => {
        void setActiveSlide((prev) => (prev + 1) % 3);
        setTimeout(() => {
          void setIsTransitioning(false);
        }, 300);
      }, 300);
    }, 4000);

    // eslint-disable-next-line
    return () => clearInterval(interval);
  }, [isHovered, userInteracted, isPageVisible]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      const isVisible = !document.hidden;
      void setIsPageVisible(isVisible);

      if (!isVisible) {
        void setIsTransitioning(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const handleDotClick = (slideIndex: number) => {
    void setUserInteracted(true);
    void setActiveSlide(slideIndex);
  };

  const handleMouseEnter = () => {
    void setIsHovered(true);
  };

  const handleMouseLeave = () => {
    void setIsHovered(false);
    void setUserInteracted(false);
  };

  return {
    activeSlide,
    isTransitioning,
    isHovered,
    handleDotClick,
    handleMouseEnter,
    handleMouseLeave,
  };
}
