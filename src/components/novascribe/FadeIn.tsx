import { motion } from 'motion/react';
import { ReactNode } from 'react';

// Scroll-reveal wrapper used across the NovaScribe landing sections.
export function FadeIn({
  children,
  delay = 0,
  className = '',
  direction = 'up',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  direction?: 'up' | 'down' | 'left' | 'right' | 'none';
  // Declared so callers can pass `key` when rendering FadeIn inside a .map()
  // (React consumes it; TS otherwise rejects it on this inline props type).
  key?: string | number;
}) {
  const initial = () => {
    switch (direction) {
      case 'up':
        return { opacity: 0, y: 24 };
      case 'down':
        return { opacity: 0, y: -24 };
      case 'left':
        return { opacity: 0, x: 24 };
      case 'right':
        return { opacity: 0, x: -24 };
      default:
        return { opacity: 0 };
    }
  };

  return (
    <motion.div
      initial={initial()}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, margin: '-100px' }}
      transition={{ duration: 0.7, delay, ease: [0.21, 0.47, 0.32, 0.98] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export default FadeIn;
