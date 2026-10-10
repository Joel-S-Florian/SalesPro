import React, { useEffect } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { money } from '../../utils/format';

/**
 * Importe que cuenta hasta su nuevo valor (≈350 ms, ease-out). Comunica que el total cambió sin
 * distraer; con "reducir movimiento" salta directamente al valor.
 */
export default function AnimatedMoney({ value, className = '' }) {
  const reduceMotion = useReducedMotion();
  const motionValue = useMotionValue(value);
  const text = useTransform(motionValue, money);

  useEffect(() => {
    if (reduceMotion) {
      motionValue.set(value);
      return undefined;
    }
    const controls = animate(motionValue, value, { duration: 0.35, ease: [0.23, 1, 0.32, 1] });
    return () => controls.stop();
  }, [value, reduceMotion, motionValue]);

  return <motion.span className={className}>{text}</motion.span>;
}
