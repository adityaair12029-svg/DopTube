import React from 'react';

interface DopTubeLogoProps {
  compact?: boolean;
  showRegion?: boolean;
}

export const DopTubeLogo: React.FC<DopTubeLogoProps> = ({ compact = false, showRegion = true }) => {
  return (
    <span className="inline-flex items-center gap-2 select-none whitespace-nowrap shrink-0">
      <span className="w-8 h-6 rounded-md bg-[#0f1419] dark:bg-white text-white dark:text-black inline-flex items-center justify-center shrink-0">
        <svg
          width="16"
          height="14"
          viewBox="0 0 18 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path d="M5 3.2L14.2 8L5 12.8V3.2Z" fill="currentColor" />
          <path d="M2.8 4.4V11.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.8" />
        </svg>
      </span>
      {!compact && (
        <span className="inline-flex items-start">
          <span className="font-display text-[19px] font-extrabold tracking-[-0.03em] text-[#0f1419] dark:text-white leading-none">
            DopTube
          </span>
          {showRegion && (
            <span className="ml-1 -mt-0.5 text-[10px] font-semibold text-[#536471] dark:text-[#71767b] leading-none">
              IN
            </span>
          )}
        </span>
      )}
    </span>
  );
};
