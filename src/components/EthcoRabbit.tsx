import React, { useState } from 'react';
import { motion } from 'motion/react';

interface EthcoRabbitProps {
  className?: string;
}

/**
 * Ethco brand mascot: a rabbit that hops into view, then idles
 * and nibbles a carrot. Uses the transparent rabbit.svg + Todo.svg assets.
 */
export const EthcoRabbit: React.FC<EthcoRabbitProps> = ({ className }) => {
  const [showCarrot, setShowCarrot] = useState(false);
  const [eating, setEating] = useState(false);

  // Start the carrot nibble loop a moment after the rabbit lands
  React.useEffect(() => {
    const t = setTimeout(() => setShowCarrot(true), 2400);
    return () => clearTimeout(t);
  }, []);

  // Nibble loop: bob toward carrot periodically
  React.useEffect(() => {
    const t = setInterval(() => {
      setEating(true);
      setTimeout(() => setEating(false), 2600);
    }, 5200);
    return () => clearInterval(t);
  }, []);

  return (
    <motion.div
      className={`relative pointer-events-none select-none ${className || ''}`}
      initial={{ x: '-42vw', y: 0 }}
      animate={{ x: 0, y: 0 }}
      transition={{
        type: 'spring',
        stiffness: 60,
        damping: 14,
        mass: 1,
        delay: 0.4,
      }}
    >
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        className="relative"
      >
        {/* Rabbit body */}
        <motion.img
          src="/assets/rabbit.svg"
          alt="Ethco rabbit"
          className="h-16 w-16 sm:h-20 sm:w-20 object-contain drop-shadow-[0_6px_12px_rgba(136,57,60,0.25)]"
          animate={
            eating
              ? { rotate: [0, -6, 4, 0], y: [0, 2, 0] }
              : { rotate: [0, 1.5, -1.5, 0] }
          }
          transition={
            eating
              ? { duration: 0.5, repeat: 4, ease: 'easeInOut' }
              : { duration: 3, repeat: Infinity, ease: 'easeInOut' }
          }
        />

        {/* Carrot that the rabbit nibbles */}
        <motion.img
          src="/assets/carrot.svg"
          alt="carrot"
          className="absolute left-full top-2 ml-1 h-7 w-7 sm:h-9 sm:w-9 object-contain"
          initial={{ opacity: 0, x: 10 }}
          animate={
            showCarrot
              ? { opacity: 1, x: eating ? [0, -3, 0] : 0 }
              : { opacity: 0, x: 10 }
          }
          transition={
            eating ? { x: { duration: 0.4, repeat: 2, ease: 'easeInOut' } } : {}
          }
        />
      </motion.div>
    </motion.div>
  );
};
