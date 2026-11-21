import { motion, useReducedMotion } from "motion/react";

/** The reference's stepped bands: colour stripes with dithered stair edges. */
export const BAND_STRIPES = ["#7A825B", "#23663F", "#7DB069", "#DDC362", "#CE8E3D", "#F1A783"];

const WIDTH = 1200;
const PIXEL = 8;
const DITHER_ROWS = 3;

/** Decorative multicolour band; `stripeHeight` in viewBox units. Motion is a slow horizontal shift. */
export function PixelBand({ className = "", stripeHeight = 20, flip = false }:
  { className?: string; stripeHeight?: number; flip?: boolean }) {
  const reduce = useReducedMotion();
  const height = BAND_STRIPES.length * stripeHeight;
  return (
    <svg viewBox={`0 0 ${WIDTH} ${height}`} preserveAspectRatio="none" aria-hidden
      className={`pointer-events-none block w-full ${flip ? "-scale-y-100" : ""} ${className}`}>
      <motion.g animate={{ x: reduce ? 0 : -PIXEL * 4 }}
        transition={reduce ? { duration: 0 } : { repeat: Infinity, repeatType: "mirror", duration: 8, ease: "linear" }}>
        {BAND_STRIPES.map((color, i) => (
          <g key={color}>
            {i > 0 && Array.from({ length: DITHER_ROWS }).map((_, r) =>
              Array.from({ length: WIDTH / (PIXEL * 4) + 2 }).map((_, j) =>
                (j + r + i) % 2 === 0 ? (
                  <rect key={`${r}-${j}`} x={j * PIXEL * 4 + ((r + i) % 2) * PIXEL * 2 - PIXEL * 4}
                    y={i * stripeHeight - (DITHER_ROWS - r) * PIXEL} width={PIXEL} height={PIXEL} fill={color} />
                ) : null))}
            <rect x={-PIXEL * 4} y={i * stripeHeight} width={WIDTH + PIXEL * 8} height={stripeHeight} fill={color} />
          </g>
        ))}
      </motion.g>
    </svg>
  );
}

/** Thin dithered strip in one colour, used on section seams. */
export function DitherEdge({ color, className = "" }: { color: string; className?: string }) {
  return (
    <div aria-hidden className={`pixel-dither h-3 w-full ${className}`} style={{ color }} />
  );
}
