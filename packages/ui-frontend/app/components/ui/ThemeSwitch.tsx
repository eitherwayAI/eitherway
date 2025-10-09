import { useStore } from '@nanostores/react';
import { memo, useEffect, useState } from 'react';
import { themeStore, toggleTheme } from '~/lib/stores/theme';
import { IconButton } from './IconButton';

interface ThemeSwitchProps {
  className?: string;
}

export const ThemeSwitch = memo(({ className }: ThemeSwitchProps) => {
  const theme = useStore(themeStore);
  const [domLoaded, setDomLoaded] = useState(false);

  useEffect(() => {
    setDomLoaded(true);
  }, []);

  return (
    domLoaded && (
      <IconButton
  className={`${className} [&>*]:!text-4xl [&>*]:!w-8 [&>*]:!h-8`}
  icon="i-ph-bug-duotone"
  size="xl"
  title="Report a Problem"
  onClick={() => window.open('https://t.me/Eitherway_support', '_blank')}
/>
    )
  );
});
