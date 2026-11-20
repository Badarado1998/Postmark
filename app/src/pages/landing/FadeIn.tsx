import { motion, useReducedMotion } from "motion/react";

export function FadeIn({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className}
      initial={reduce ? false : { y: 24 }}
      whileInView={{ y: 0 }}
      viewport={{ once: true, amount: 0 }}
      transition={{ duration: reduce ? 0 : 0.5, ease: "easeOut" }}>
      {children}
    </motion.div>
  );
}
