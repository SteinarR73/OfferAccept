import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

// Rendered as the browser tab favicon. Uses the brand green and the "OA"
// monogram since embedding a full PNG asset in ImageResponse requires a
// fetch at build time. The actual handshake icon PNG is used for larger
// apple-touch-icon and manifest icon placements via the metadata config.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: '#16a34a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif',
          fontWeight: 700,
          fontSize: 13,
          color: '#fff',
          letterSpacing: '-0.3px',
        }}
      >
        OA
      </div>
    ),
    { ...size },
  );
}
