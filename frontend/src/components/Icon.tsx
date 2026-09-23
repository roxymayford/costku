import React from 'react';

type IconName =
  | 'alert' | 'bolt' | 'check' | 'x' | 'info' | 'star' | 'arrowRight'
  | 'external' | 'settings' | 'swap' | 'lock' | 'sparkle'
  | 'menu' | 'close' | 'trash' | 'plus' | 'minus' | 'home' | 'wallet' | 'list' | 'user'
  | 'arrowDown' | 'search'
  | 'hand' | 'dot' | 'store' | 'utensils' | 'bus' | 'shield' | 'chart'
  | 'target' | 'clock' | 'fire' | 'coffee' | 'cart'
  | 'calendar' | 'lightbulb' | 'fuel' | 'film' | 'brain';

interface IconProps {
  name: IconName;
  className?: string;
  size?: number;
  'aria-hidden'?: boolean;
}

const paths: Record<IconName, React.ReactNode> = {
  alert: <path d="M12 3 2.5 20h19L12 3Zm0 6v5m0 3h.01" />,
  bolt: <path d="m13 2-9 13h7l-1 7 9-13h-7l1-7Z" />,
  check: <path d="m4 12 5 5L20 6" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  info: <path d="M12 17v-6m0-4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  star: <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />,
  arrowRight: <path d="M5 12h14m-6-6 6 6-6 6" />,
  external: <path d="M14 4h6v6m0-6L10 14m10 0v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5" />,
  settings: <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Zm0-13v3m0 13v3m8.2-11.8-2.6 1.5m-11.2 6.5-2.6 1.5m16.4 0-2.6-1.5M6.4 6.3 3.8 4.8" />,
  swap: <path d="M7 7h13m-4-4 4 4-4 4M17 17H4m4 4-4-4 4-4" />,
  lock: <path d="M7 10V8a5 5 0 0 1 10 0v2M6 10h12v10H6V10Z" />,
  sparkle: <path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Zm7 12 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" />,
  menu: <path d="M3 6h18M3 12h18M3 18h18" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  trash: <path d="M3 6h18M8 6V4h8v2m-9 0v14a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6M10 11v6m4-6v6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1v-9.5Z" />,
  wallet: <path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1h2v8h-2v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm14 6h.01" />,
  list: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
  user: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4 0-7 2.2-7 5v1h14v-1c0-2.8-3-5-7-5Z" />,
  arrowDown: <path d="M12 5v14m-6-6 6 6 6-6" />,
  search: <path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35" />,
  hand: (
    <path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11m0-.5V4.5a1.5 1.5 0 0 1 3 0V11m0-.5V6a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7h-1a6 6 0 0 1-5.2-3l-2-3.3a1.6 1.6 0 0 1 2.6-1.8L9 15V11Z" />
  ),
  dot: <path d="M12 19a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z" />,
  store: (
    <path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9M3 9l1.8-5.2A1 1 0 0 1 5.8 3h12.4a1 1 0 0 1 .9.8L21 9M3 9h18M9 20v-5h6v5" />
  ),
  utensils: <path d="M6 3v7m0 0v11M6 3v7m4-7v7a4 4 0 0 1-4 0M17 3c-1.5 2-2 4-2 6.5V13h4V9.5C19 7 18.5 5 17 3Zm2 10v8" />,
  bus: (
    <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9H4V6Zm0 9h16v3H4v-3Zm3 3v2m10-2v2M4 10h16M8 13h.01M16 13h.01" />
  ),
  shield: <path d="M12 3l7.5 3v5.5c0 4.5-3.1 8.4-7.5 9.5-4.4-1.1-7.5-5-7.5-9.5V6L12 3Zm-3 9 2.2 2.2L15.5 10" />,
  chart: <path d="M4 20V4m0 16h16M8 20v-7m4 7V8m4 12v-4" />,
  target: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0-3a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />,
  clock: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3.5 2" />,
  fire: (
    <path d="M12 3s5 4.2 5 9a5 5 0 0 1-10 0c0-1.4.5-2.6 1.2-3.6C9.4 10 10 11 11 11.5 10.5 9 12 6 12 3Z" />
  ),
  coffee: <path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Zm13 1h2a2.5 2.5 0 0 1 0 5h-2M4 21h13" />,
  cart: <path d="M3 4h2.5l2.2 10.5a1 1 0 0 0 1 .8h8.6a1 1 0 0 0 1-.8L20 7H6M10 19.5h.01M17 19.5h.01" />,
  calendar: <path d="M4 8V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2M4 8v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M4 8h16M8 2v4m8-4v4m-8 6h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />,
  lightbulb: <path d="M9 21h6m-3-3v-4m0 0a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-2.5-3.5h5" />,
  fuel: <path d="M4 20V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v14M4 20h10M14 10h2a2 2 0 0 1 2 2v3a1 1 0 0 0 1 1 1 1 0 0 0 1-1V8l-2-2M7 10h4" />,
  film: <path d="M4 4h16v16H4V4Zm4 0v16m8-16v16M4 8h4m8 0h4M4 12h16M4 16h4m8 0h4" />,
  brain: <path d="M12 3a5 5 0 0 0-4.8 3.5A4 4 0 0 0 4 10.5a4 4 0 0 0 2.2 3.6A5 5 0 0 0 12 21a5 5 0 0 0 5.8-6.9A4 4 0 0 0 20 10.5a4 4 0 0 0-3.2-3.9A5 5 0 0 0 12 3Zm0 0v18" />,
};

export function Icon({ name, className, size = 16, 'aria-hidden': ariaHidden = true }: IconProps) {
  return (
    <svg
      aria-hidden={ariaHidden}
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}
