import React from 'react';
import { Marquee } from '../../../components/motion/Marquee';

const MARQUEE_ITEMS = ['GAJI MASUK', 'TAHU BATAS', 'JAJAN AMAN'];

export const MarqueeStrip: React.FC = () => {
  return <Marquee items={MARQUEE_ITEMS} base={0.7} />;
};
