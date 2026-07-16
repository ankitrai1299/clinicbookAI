import { motion } from 'motion/react';
import { ReactNode } from 'react';

export function FadeIn({ children, delay = 0, className = '', direction = 'up' }: { children: ReactNode, delay?: number, className?: string, direction?: 'up' | 'down' | 'left' | 'right' | 'none', key?: string | number }) {
  const getInitialState = () => {
    switch (direction) {
      case 'up': return { opacity: 0, y: 24 };
      case 'down': return { opacity: 0, y: -24 };
      case 'left': return { opacity: 0, x: 24 };
      case 'right': return { opacity: 0, x: -24 };
      case 'none': return { opacity: 0 };
    }
  };

  return (
    <motion.div
      initial={getInitialState()}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.7, delay, ease: [0.21, 0.47, 0.32, 0.98] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
