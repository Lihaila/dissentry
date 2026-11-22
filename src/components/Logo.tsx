export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap sm:gap-2">
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="shrink-0">
        <rect width="64" height="64" rx="14" className="fill-slate-900" />
        <path d="M18 16h14a16 16 0 0 1 0 32H18z" fill="none" className="stroke-white" strokeWidth="6" />
        <circle cx="46" cy="18" r="7" fill="#f59e0b" />
      </svg>
      <span className="text-[17px] font-extrabold tracking-tight sm:text-lg">Dissentry</span>
    </span>
  );
}
