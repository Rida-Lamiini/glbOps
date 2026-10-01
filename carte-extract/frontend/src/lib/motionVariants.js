export const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.18 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

export const drawerVariants = {
  hidden: { x: 44, opacity: 0 },
  visible: { x: 0, opacity: 1, transition: { type: "spring", damping: 32, stiffness: 320 } },
  exit: { x: 44, opacity: 0, transition: { duration: 0.16, ease: "easeIn" } },
};

export const modalVariants = {
  hidden: { scale: 0.95, opacity: 0, y: 10 },
  visible: { scale: 1, opacity: 1, y: 0, transition: { type: "spring", damping: 28, stiffness: 360 } },
  exit: { scale: 0.96, opacity: 0, y: 8, transition: { duration: 0.15, ease: "easeIn" } },
};

export const fadeUpVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2 } },
};

export const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.035 } },
};
