import React from 'react';

interface DopTubeLogoProps {
  compact?: boolean;
  showRegion?: boolean;
}

export const DopTubeLogo: React.FC<DopTubeLogoProps> = ({ compact = false, showRegion = true }) => {
  return (
    <span className="inline-flex items-center gap-1.5 select-none whitespace-nowrap shrink-0">
      <svg
        width="30"
        height="22"
        viewBox="0 0 30 22"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect width="30" height="22" rx="6" fill="#ff0033" />
        <path d="M11.5 6.2L20.8 11L11.5 15.8V6.2Z" fill="white" />
        <path d="M9 7.8V14.2" stroke="white" strokeWidth="1.8" strokeLinecap="round" opacity="0.85" />
      </svg>
      {!compact && (
        <span className="inline-flex items-start">
          <span className="font-display text-[19px] font-bold tracking-[-0.03em] text-[#0f0f0f] dark:text-white leading-none">
            DopTube
          </span>
          {showRegion && (
            <span className="ml-1 -mt-0.5 text-[10px] font-medium text-[#606060] dark:text-[#aaaaaa] leading-none">
              IN
            </span>
          )}
        </span>
      )}
    </span>
  );
};
