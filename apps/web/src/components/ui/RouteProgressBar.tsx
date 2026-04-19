'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Lightweight CSS-only route change progress bar.
 * Mounts a thin accent-coloured bar at the top of the viewport that animates
 * from 0 → ~80 % on route start, then snaps to 100 % and fades out.
 */
export function RouteProgressBar() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPath = useRef(pathname);

  useEffect(() => {
    if (pathname === prevPath.current) return;
    prevPath.current = pathname;

    // Clear any running animation
    if (timerRef.current) clearTimeout(timerRef.current);

    // Start: snap to 15 % immediately, animate to 85 % over 200 ms
    setVisible(true);
    setWidth(15);

    timerRef.current = setTimeout(() => {
      setWidth(85);
      // Complete: jump to 100 %, then fade out
      timerRef.current = setTimeout(() => {
        setWidth(100);
        timerRef.current = setTimeout(() => {
          setVisible(false);
          setWidth(0);
        }, 300);
      }, 200);
    }, 10);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [pathname]);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      style={{ width: `${width}%`, transition: width === 100 ? 'width 200ms ease-out' : 'width 200ms ease-in-out' }}
      className="fixed top-0 left-0 h-[3px] z-[9999] bg-(--color-accent) opacity-90 pointer-events-none"
    />
  );
}
