/** A thin band of running Greek key, in the current text color. */
export function Meander({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`bg-meander h-4 ${className}`} />;
}
