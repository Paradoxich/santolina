/**
 * Shared slide-in animation for app drawers, passed to the kit `Drawer` via
 * `panelComponent={motion.aside}` + `panelProps={DRAWER_MOTION}`. The kit
 * carries no framer-motion dependency — this constant is the app's single
 * source of truth for drawer motion. Exit animation requires the caller to
 * wrap the drawer in `<AnimatePresence>` (already the pattern everywhere).
 */
export const DRAWER_MOTION = {
  initial: { x: '100%' },
  animate: { x: 0 },
  exit: { x: '100%' },
  transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] as const },
}
