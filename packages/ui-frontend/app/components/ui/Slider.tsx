import { memo } from 'react';
import { classNames } from '~/utils/classNames';
import { genericMemo } from '~/utils/react';

interface SliderOption<T> {
  value: T;
  text: string;
}

export interface SliderOptions<T> {
  left: SliderOption<T>;
  right: SliderOption<T>;
}

interface SliderProps<T> {
  selected: T;
  options: SliderOptions<T>;
  setSelected?: (selected: T) => void;
}

export const Slider = genericMemo(<T,>({ selected, options, setSelected }: SliderProps<T>) => {
  const isLeftSelected = selected === options.left.value;

  return (
    <div className="flex items-center flex-wrap border border-eitherway-elements-borderColor shrink-0 gap-1 overflow-hidden rounded-full p-1">
      <SliderButton selected={isLeftSelected} setSelected={() => setSelected?.(options.left.value)}>
        <img src="/icons/chat/brackets.svg" alt="Brackets" />
      </SliderButton>
      <SliderButton selected={!isLeftSelected} setSelected={() => setSelected?.(options.right.value)}>
        <img src="/icons/chat/eye.svg" alt="Eye" />
      </SliderButton>
    </div>
  );
});

interface SliderButtonProps {
  selected: boolean;
  children: string | JSX.Element | Array<JSX.Element | string>;
  setSelected: () => void;
}

const SliderButton = memo(({ selected, children, setSelected }: SliderButtonProps) => {
  return (
    <button
      onClick={setSelected}
      className={classNames(
        'text-sm px-2.5 py-1 rounded-full bg-black relative',
        selected ? 'opacity-100' : 'opacity-50 hover:opacity-100',
      )}
    >
      <span className="relative z-10">{children}</span>
    </button>
  );
});
