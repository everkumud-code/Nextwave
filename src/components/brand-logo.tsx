import Link from "next/link";

/**
 * The NextWave logo ("nextwave, A Next Resource Company"). Use the dark variant on a dark background.
 * Wherever it is shown, clicking it opens the home page; pass link={false} where it must not be a link (the opening animation).
 */
export function BrandLogo({ variant = "light", className = "h-9 w-auto", link = true }: { variant?: "light" | "dark"; className?: string; link?: boolean }) {
  const image = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={variant === "dark" ? "/brand/nextwave-logo-dark.png" : "/brand/nextwave-logo.png"} alt="NextWave, a Next Resource company" width={900} height={333} className={className} />
  );
  if (!link) return image;
  return <Link href="/" aria-label="NextWave home" title="Home" className="inline-block shrink-0 cursor-pointer">{image}</Link>;
}
