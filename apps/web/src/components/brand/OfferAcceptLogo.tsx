import Image from 'next/image';

// Full horizontal logo: icon + "OfferAccept" wordmark + tagline.
// For use on light/white backgrounds (landing nav, auth pages, pricing).

type LogoSize = 'sm' | 'md' | 'lg';

// Intrinsic dims match the PNG asset (wide horizontal, ~4.4:1 ratio).
// Next.js Image uses these for CLS prevention; display size is set by className.
const SIZE_MAP: Record<LogoSize, { width: number; height: number }> = {
  sm: { width: 180, height: 41 },
  md: { width: 260, height: 59 },
  lg: { width: 360, height: 82 },
};

interface Props {
  size?: LogoSize;
  className?: string;
  priority?: boolean;
}

export function OfferAcceptLogo({ size = 'md', className, priority = false }: Props) {
  const { width, height } = SIZE_MAP[size];
  return (
    <Image
      src="/brand/offeraccept-logo.png"
      alt="OfferAccept"
      width={width}
      height={height}
      className={className}
      priority={priority}
      style={{ objectFit: 'contain' }}
    />
  );
}
