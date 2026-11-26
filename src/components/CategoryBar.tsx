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
    <div className="bg-transparent px-3 sm:px-0 py-2 flex items-center gap-2 border-b border-[#e5e7eb] dark:border-[#1e2638]">
      <button
        type="button"
        onClick={() => scrollBy(-240)}
        aria-label="Scroll categories left"
        className="hidden sm:flex w-8 h-8 rounded-full items-center justify-center hover:bg-[#eff3f4] dark:hover:bg-[#101524] shrink-0 cursor-pointer"
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
              className={`h-8 px-3.5 rounded-full text-[13px] font-semibold whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                active
                  ? 'jio-gradient text-white shadow-[0_2px_12px_rgba(124,58,237,0.35)]'
                  : 'bg-[#eff3f4] text-[#0f1419] hover:bg-neutral-200 dark:bg-[#141926] dark:text-[#e7e9ea] dark:hover:bg-[#1d2538] border border-transparent dark:border-[#232b3e]'
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
        className="hidden sm:flex w-8 h-8 rounded-full items-center justify-center hover:bg-[#eff3f4] dark:hover:bg-[#16181c] shrink-0 cursor-pointer"
      >
        <ChevronRight className="w-4 h-4" />
      </button>

      {/* Indian Language Discovery Selector */}
      <div className="relative shrink-0 flex items-center">
        <Globe className="w-3.5 h-3.5 absolute left-2.5 pointer-events-none text-[#536471] dark:text-[#71767b]" />
        <select
          aria-label="Filter by Indian language"
          value={selectedLanguage}
          onChange={(e) => onSelectLanguage(e.target.value)}
          className="h-8 pl-7 pr-2 sm:pr-4 rounded-full text-[12px] sm:text-[13px] font-semibold bg-[#eff3f4] dark:bg-[#202327] text-[#0f1419] dark:text-[#e7e9ea] border border-transparent focus:border-[#0f1419] dark:focus:border-white focus:outline-none cursor-pointer"
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
