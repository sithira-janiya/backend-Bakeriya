// Canonical bakery menu — the single source of truth seeded into Pocketbase.
// Mirrors the shape the frontend expects: { id, name:{en,si}, category, price,
// tags, description:{en,si}, emoji, available }.

export const CATEGORIES = ['All', 'Breads', 'Cakes', 'Pastries', 'Cookies', 'Beverages']
export const TAGS = ['veg', 'gluten-free', 'bestseller', 'eggless', 'vegan']

export const menuItems = [
  {
    id: 'brd-1',
    name: { en: 'Sourdough Loaf', si: 'සවර්ඩෝ පාන්' },
    category: 'Breads',
    price: 6.5,
    tags: ['veg', 'vegan'],
    description: {
      en: 'Slow-fermented, crackly crust, open crumb.',
      si: 'සෙමින් පිරිපහදු කළ, කරකරන පිටත පෘෂ්ඨයක් සහ මෘදු ඇතුළතක් සහිත පාන්.'
    },
    emoji: '🍞',
    available: true
  },
  {
    id: 'brd-2',
    name: { en: 'Garlic Focaccia', si: 'සුදුළූණු ෆොකැචියා' },
    category: 'Breads',
    price: 5.0,
    tags: ['veg', 'vegan'],
    description: {
      en: 'Olive oil, rosemary, roasted garlic.',
      si: 'ඔලිව් තෙල්, රෝස්මේරි සහ පිළිස්සූ සුදුළූණු සමඟ.'
    },
    emoji: '🫓',
    available: true
  },
  {
    id: 'brd-3',
    name: { en: 'Multigrain Batard', si: 'බහුධාන්‍ය බටාර්ඩ් පාන්' },
    category: 'Breads',
    price: 6.0,
    tags: ['veg', 'vegan'],
    description: {
      en: 'Seven grains, seeds on the crust.',
      si: 'ධාන්‍ය වර්ග හතක් සහ පිටත බීජ ආවරණයක් සහිතයි.'
    },
    emoji: '🥖',
    available: true
  },
  {
    id: 'cak-1',
    name: { en: 'Classic Vanilla Cake', si: 'සම්ප්‍රදායික වැනිලා කේක්' },
    category: 'Cakes',
    price: 22.0,
    tags: ['veg'],
    description: {
      en: 'Vanilla bean sponge, buttercream.',
      si: 'වැනිලා ස්පොන්ජ් සහ බටර්ක්‍රීම් සහිතයි.'
    },
    emoji: '🎂',
    available: true
  },
  {
    id: 'cak-2',
    name: { en: 'Chocolate Fudge Cake', si: 'චොකලට් ෆජ් කේක්' },
    category: 'Cakes',
    price: 24.0,
    tags: ['veg', 'bestseller'],
    description: {
      en: 'Dark chocolate ganache, rich and dense.',
      si: 'තද චොකලට් ගනාෂ් සහිත, පොහොසත් හා ඝන කේකයකි.'
    },
    emoji: '🍫',
    available: true
  },
  {
    id: 'cak-3',
    name: { en: 'Red Velvet Cake', si: 'රෙඩ් වෙල්වට් කේක්' },
    category: 'Cakes',
    price: 25.0,
    tags: ['veg', 'bestseller'],
    description: {
      en: 'Cream cheese frosting, classic crumb.',
      si: 'ක්‍රීම් චීස් ෆ්‍රොස්ටින් සහ සම්ප්‍රදායික මෘදුකමක් සහිතයි.'
    },
    emoji: '🍰',
    available: false
  },
  {
    id: 'pas-1',
    name: { en: 'Butter Croissant', si: 'බටර් ක්‍රෝසන්ට්' },
    category: 'Pastries',
    price: 3.5,
    tags: ['veg', 'bestseller'],
    description: {
      en: 'All-butter, laminated, flaky.',
      si: 'සම්පූර්ණ බටර්, ස්ථර ගත, සිහින් කැළිති සහිතයි.'
    },
    emoji: '🥐',
    available: true
  },
  {
    id: 'pas-2',
    name: { en: 'Pain au Chocolat', si: 'චොකලට් ක්‍රෝසන්ට්' },
    category: 'Pastries',
    price: 4.0,
    tags: ['veg'],
    description: {
      en: 'Dark chocolate batons, buttery layers.',
      si: 'තද චොකලට් කොටස් සහ බටර් ස්ථර සහිතයි.'
    },
    emoji: '🥐',
    available: true
  },
  {
    id: 'pas-3',
    name: { en: 'Cheese Danish', si: 'චීස් ඩැනිෂ්' },
    category: 'Pastries',
    price: 4.5,
    tags: ['veg'],
    description: {
      en: 'Sweet cream cheese, apricot glaze.',
      si: 'මිහිරි ක්‍රීම් චීස් සහ ඇප්‍රිකොට් ග්ලේස් සහිතයි.'
    },
    emoji: '🧁',
    available: true
  },
  {
    id: 'coo-1',
    name: { en: 'Choc Chip Cookie', si: 'චොකලට් චිප් කුකී' },
    category: 'Cookies',
    price: 2.5,
    tags: ['veg', 'bestseller'],
    description: {
      en: 'Crisp edge, gooey center.',
      si: 'පිටත සිහින් සහ මැද මෘදු කුකියකි.'
    },
    emoji: '🍪',
    available: true
  },
  {
    id: 'coo-2',
    name: { en: 'Oatmeal Raisin Cookie', si: 'ඕට්ස් සහ රටකජු කුකී' },
    category: 'Cookies',
    price: 2.5,
    tags: ['veg', 'eggless'],
    description: {
      en: 'Chewy oats, plump raisins.',
      si: 'හපන්නට සුවදායී ඕට්ස් සහ රටකජු සහිතයි.'
    },
    emoji: '🍪',
    available: true
  },
  {
    id: 'coo-3',
    name: { en: 'Gluten-Free Almond Cookie', si: 'ග්ලූටන් රහිත ආමන්ඩ් කුකී' },
    category: 'Cookies',
    price: 3.0,
    tags: ['veg', 'gluten-free'],
    description: {
      en: 'Almond flour, naturally gluten-free.',
      si: 'ආමන්ඩ් පිටි වලින් සැකසූ, ස්වභාවිකවම ග්ලූටන් රහිතයි.'
    },
    emoji: '🍪',
    available: true
  },
  {
    id: 'bev-1',
    name: { en: 'Filter Coffee', si: 'ෆිල්ටර් කෝපි' },
    category: 'Beverages',
    price: 3.0,
    tags: ['veg', 'vegan'],
    description: {
      en: 'Freshly brewed, served hot.',
      si: 'අලුතින් සකස් කළ, උණුසුම්ව සපයනු ලැබේ.'
    },
    emoji: '☕',
    available: true
  },
  {
    id: 'bev-2',
    name: { en: 'Belgian Hot Chocolate', si: 'බෙල්ජියානු හොට් චොකලට්' },
    category: 'Beverages',
    price: 4.0,
    tags: ['veg'],
    description: {
      en: 'Rich, thick, topped with cream.',
      si: 'පොහොසත්, ඝන, ක්‍රීම් සමඟ සපයනු ලැබේ.'
    },
    emoji: '🍫',
    available: true
  }
]
