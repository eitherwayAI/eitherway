/**
 * Category Tabs for Brand Kit Gallery
 * Filters assets by type: Icons, Logos, Images, Fonts, Videos
 */

export type AssetCategory = 'icons' | 'logos' | 'images' | 'fonts' | 'videos';

interface CategoryTabsProps {
  activeCategory: AssetCategory;
  onCategoryChange: (category: AssetCategory) => void;
  counts: Record<AssetCategory, number>;
}

export function CategoryTabs({ activeCategory, onCategoryChange, counts }: CategoryTabsProps) {
  const categories: Array<{
    id: AssetCategory;
    label: string;
    icon: string;
  }> = [
    { id: 'icons', label: 'Icons', icon: 'i-ph:app-window' },
    { id: 'logos', label: 'Logos', icon: 'i-ph:image' },
    { id: 'images', label: 'Images', icon: 'i-ph:images' },
    { id: 'fonts', label: 'Fonts', icon: 'i-ph:text-aa' },
    { id: 'videos', label: 'Videos', icon: 'i-ph:video' },
  ];

  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      {categories.map((category) => {
        const isActive = activeCategory === category.id;
        const count = counts[category.id] || 0;

        return (
          <button
            key={category.id}
            onClick={() => onCategoryChange(category.id)}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all whitespace-nowrap
              ${
                isActive
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'
              }
            `}
          >
            <div className={`${category.icon} text-lg`} />
            <span>{category.label}</span>
            {count > 0 && (
              <span
                className={`
                  ml-1 px-2 py-0.5 rounded-full text-xs font-bold
                  ${isActive ? 'bg-blue-700 text-blue-100' : 'bg-gray-700 text-gray-400'}
                `}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
