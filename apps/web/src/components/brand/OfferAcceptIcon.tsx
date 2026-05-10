import Image from 'next/image';

// Icon-only handshake circle logo.
// Works on any background — the circle design is self-contained.

type IconSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_MAP: Record<IconSize, number> = {
  sm: 32,
  md: 48,
  lg: 72,
  xl: 96,
};

interface Props {
  size?: IconSize;
  className?: string;
  priority?: boolean;
}

export function OfferAcceptIcon({ size = 'md', className, priority = false }: Props) {
  const px = SIZE_MAP[size];
  return (
    <Image
      src="/brand/offeraccept-logopic.png"
      alt="OfferAccept"
      width={px}
      height={px}
      className={className}
      priority={priority}
      style={{ objectFit: 'contain' }}
    />
  );
}
