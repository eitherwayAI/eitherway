import styles from './Landing.module.scss';
import { Header } from './Header';
import { ClientOnly } from 'remix-utils/client-only';

export function Landing() {
  return (
    <div className={styles.landing}>
      <ClientOnly>{() => <Header />}</ClientOnly>
    </div>
  );
}
