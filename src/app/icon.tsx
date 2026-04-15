import { ImageResponse } from 'next/og';

export const size = {
  width: 64,
  height: 64,
};

export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(145deg, #0a2342 0%, #07162c 100%)',
          color: '#11b7d6',
          fontSize: 36,
          fontWeight: 800,
          fontFamily: 'Arial, sans-serif',
          letterSpacing: '-2px',
          borderRadius: 14,
          border: '3px solid #11b7d6',
        }}
      >
        IW
      </div>
    ),
    {
      ...size,
    }
  );
}
