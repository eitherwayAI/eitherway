import styles from './Landing.module.scss';
import { CornerDecorations } from './CornerDecorations';

export function RightSidebar() {
  return (
    <div className={styles['right-sidebar']}>
      <div className={styles['buy-token-card']}>
        <div className={styles['rainbow-circle']}>
          <img src="/icons/rainbowCircle.svg" alt="Rainbow Circle" />
        </div>
        <div className={styles['text-content']}>
          <h3>BUY TOKEN</h3>
          <p className={styles['network-text']}>Ethereum Mainnet</p>
          <span className={styles['price-badge']}>+19.51%</span>
        </div>
        <button className={styles['buy-button']}>
          <img src="/icons/buyArrow.svg" alt="Buy Arrow" />
        </button>
      </div>
      <a href="/chat" className={styles['launch-dapp-card']}>
        <CornerDecorations />
        <div className={styles['card-content']}>
          <img src="/icons/LaunchDapp.svg" alt="Launch dApp" />
          <span>LAUNCH APP</span>
        </div>
      </a>
    </div>
  );
}
