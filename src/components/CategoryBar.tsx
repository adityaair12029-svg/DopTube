import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight, Globe } from 'lucide-react';
import { HOME_CATEGORIES, INDIAN_LANGUAGES } from '../lib/format';

interface CategoryBarProps {
  selectedCategory: string;
  selectedLanguage: string;
  onSelectCategory: (cat: string) => void;
  onSelectLanguage: (lang: string) => void;
}

export const CategoryBar: React.FC<CategoryBarProps> = ({
  selectedCategory,
  selectedLanguage,
  onSelectCategory,
  onSelectLanguage,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollBy = (offset: number) => {
    scrollRef.current?.scrollBy({ left: offset, behavior: 'smooth' });
  };

  return (
    <div className="sticky top-14 z-20 bg-white/95 dark:bg-[#0f0f0f]/95 backdrop-blur-sm px-3 sm:px-0 py-2.5 flex items-center gap-2">
      <button
        type="button"
        onClick={() => scrollBy(-240)}
        aria-label="Scroll categories left"
        className="hidden sm:flex w-8 h-8 rounded-full items-center justify-center hover:bg-neutral-200 dark:hover:bg-[#272727] shrink-0 cursor-pointer"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      <div ref={scrollRef} className="flex items-center gap-2 overflow-x-auto no-scrollbar flex-1 py-0.5">
        {HOME_CATEGORIES.map((cat) => {
          const active = selectedCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => onSelectCategory(cat)}
              className={`h-8 px-3 rounded-[8px] text-[13px] sm:text-[14px] font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                active
                  ? 'bg-[#0f0f0f] text-white dark:bg-[#f1f1f1] dark:text-[#0f0f0f]'
                  : 'bg-neutral-100 text-[#0f0f0f] hover:bg-neutral-200 dark:bg-[#272727] dark:text-[#f1f1f1] dark:hover:bg-[#3f3f3f]'
              }`}
            >
              {cat}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => scrollBy(240)}
        aria-label="Scroll categories right"
        className="hidden sm:flex w-8 h-8 rounded-full items-center justify-center hover:bg-neutral-200 dark:hover:bg-[#272727] shrink-0 cursor-pointer"
      >
        <ChevronRight className="w-4 h-4" />
      </button>

      {/* Indian Language Discovery Selector */}
      <div className="relative shrink-0 flex items-center">
        <Globe className="w-3.5 h-3.5 absolute left-2.5 pointer-events-none text-[#606060] dark:text-[#aaaaaa]" />
        <select
          aria-label="Filter by Indian language"
          value={selectedLanguage}
          onChange={(e) => onSelectLanguage(e.target.value)}
          className="h-8 pl-7 pr-2 sm:pr-4 rounded-[8px] text-[12px] sm:text-[13px] font-medium bg-neutral-100 dark:bg-[#272727] text-[#0f0f0f] dark:text-[#f1f1f1] border border-transparent focus:border-[#3ea6ff] focus:outline-none cursor-pointer"
        >
          {INDIAN_LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>
              {lang === 'All' ? 'All langs' : lang}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};
