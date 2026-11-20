/** Postmark mark: a folded-paper P. Decorative; the wordmark sits beside it. */
export function Logo({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <img src={`${import.meta.env.BASE_URL}favicon.svg`} width={size} height={size}
      alt="" className={className} />
  );
}
