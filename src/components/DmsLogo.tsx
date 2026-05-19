import React from 'react';

interface DmsLogoProps {
  size?: number;
  className?: string;
}

export const DmsLogo: React.FC<DmsLogoProps> = ({ size = 44, className = "" }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="wineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#C15079" />
          <stop offset="100%" stopColor="#7A1C44" />
        </linearGradient>
        <linearGradient id="glowGrad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#7A1C44" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#C15079" stopOpacity="0.2" />
        </linearGradient>
        <filter id="logoShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="8" stdDeviation="6" floodColor="#7A1C44" floodOpacity="0.25" />
        </filter>
      </defs>

      <g filter="url(#logoShadow)">
        {/* Modern high-end rounded rect background with gradient shadow glow */}
        <rect x="15" y="15" width="170" height="170" rx="42" fill="#1A1F2E" stroke="#2A3441" strokeWidth="4" />
        <rect x="20" y="20" width="160" height="160" rx="38" fill="url(#glowGrad)" opacity="0.15" />

        {/* Soft background loop shape */}
        <path
          d="M100 45 C135 45 155 65 155 90 C155 110 135 125 100 125 C65 125 45 110 45 90 C45 65 65 45 100 45 Z"
          stroke="url(#wineGrad)"
          strokeWidth="10"
          strokeLinecap="round"
          opacity="0.3"
        />

        {/* Dynamic inner loop / Mobius styling */}
        <path
          d="M60 90 C60 65 78 55 100 55 C122 55 140 65 140 90 C140 115 122 135 100 135 C78 135 60 115 60 90 Z"
          fill="url(#wineGrad)"
          opacity="0.85"
        />
        {/* Central Premium Text */}
        <text
          x="100"
          y="108"
          fontFamily="system-ui, -apple-system, sans-serif"
          fontSize="36"
          fontWeight="900"
          textAnchor="middle"
          fill="#F5F8FF"
          letterSpacing="1"
        >
          DMS
        </text>
      </g>
    </svg>
  );
};
