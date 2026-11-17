/** The NextWave logo ("nextwave, A Next Resource Company"). Use the dark variant on a dark background. */
export function BrandLogo({ variant = "light", className = "h-9 w-auto" }: { variant?: "light" | "dark"; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={variant === "dark" ? "/brand/nextwave-logo-dark.png" : "/brand/nextwave-logo.png"} alt="NextWave, a Next Resource company" width={900} height={333} className={className} />
  );
}
