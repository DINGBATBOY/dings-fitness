/**
 * Restaurant Hub — seed data.
 *
 * This file is the source of truth for the curated chain restaurant database
 * used by the Restaurant Hub tab and the AI food-analysis flow. Adding a new
 * restaurant is a matter of appending a Restaurant object to the RESTAURANTS
 * array below.
 *
 * Macro values are sourced from each chain's published nutrition data (PDFs,
 * web nutrition calculators, or in-store nutrition cards). Values are subject
 * to drift as chains reformulate; each restaurant records `lastVerified` and
 * `nutritionSourceUrl` so they can be audited and refreshed.
 *
 * The Restaurant Hub UI shows official restaurant nutrition as authoritative,
 * but the data here is not a substitute for the user verifying against the
 * current restaurant menu when accuracy matters (e.g. food allergies).
 */

export type RestaurantTier = 1 | 2 | 3 | 4 | 5;

export const TIER_INFO: Record<
  RestaurantTier,
  { label: string; description: string; color: string; emoji: string }
> = {
  1: { label: 'Healthiest',    description: 'Fresh ingredients, macro-friendly, transparent nutrition.',  color: 'emerald', emoji: '🥗' },
  2: { label: 'Above Average', description: 'Cleaner options available with menu knowledge.',              color: 'lime',    emoji: '🥙' },
  3: { label: 'Navigate',      description: 'Healthy picks exist but you have to know what to order.',     color: 'amber',   emoji: '⚖️' },
  4: { label: 'Heavy',         description: 'High sodium, saturated fat, and refined carbs throughout.',   color: 'orange',  emoji: '⚠️' },
  5: { label: 'Landmines',     description: 'Almost no viable healthy options.',                           color: 'red',     emoji: '🚨' },
};

export type GoalTag = 'high-protein' | 'low-cal' | 'low-carb' | 'plant-based' | 'gluten-free';

export interface MenuItem {
  id: string;
  name: string;
  category: string;          // "Bowls", "Sides", "Drinks", "Sandwiches", "Salads", etc.
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  servingSize?: string;
  notes?: string;
  isPopular?: boolean;       // surfaced first in the UI
  goalTags?: GoalTag[];
}

export type ComponentCategory =
  | 'base'        // rice, lettuce, grains, bread
  | 'protein'     // chicken, steak, tofu
  | 'topping'     // veggies, cheese, beans
  | 'sauce'       // salsa, dressing, dips
  | 'extras';     // tortilla on the side, chips, etc.

/**
 * A single ingredient or "build component" within a customizable restaurant
 * (Chipotle, Sweetgreen, Cava, Subway, etc.). Macros are PER STANDARD PORTION
 * as defined in the restaurant's nutrition data — "1 scoop" of rice, "4oz
 * chicken", "1 oz cheese", etc.
 *
 * These are what the AI uses to handle modifier phrases like "double chicken",
 * "extra rice", "no cheese", "light beans" without falling back to a generic
 * pre-built bowl.
 */
export interface ComponentItem {
  id: string;
  name: string;
  category: ComponentCategory;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  servingSize: string;  // "1 scoop (4 oz)" — REQUIRED so the model knows the unit
  notes?: string;
}

export interface Restaurant {
  id: string;                // slug like "chipotle"
  name: string;              // full official name
  shortName: string;         // brand-recognized short form
  aliases?: string[];        // alternate spellings/abbreviations for text detection
  tier: RestaurantTier;
  category: string;          // "Fast Casual", "Coffee", "Subs", etc.
  emoji: string;
  blurb: string;
  popularityRank: number;
  officialUrl?: string;
  nutritionSourceUrl?: string;
  nutritionNote?: string;
  menuItems: MenuItem[];
  /**
   * Ingredient-level breakdown for customizable concepts. When present, the
   * AI can compose custom builds and handle modifiers like "double chicken"
   * by adding component portions to a base item.
   */
  components?: ComponentItem[];
  lastVerified?: string;     // ISO date YYYY-MM-DD
}

export const RESTAURANTS: Restaurant[] = [
  // ==========================================================================
  //  TIER 1 — Healthiest
  // ==========================================================================
  {
    id: 'chipotle',
    name: 'Chipotle Mexican Grill',
    shortName: 'Chipotle',
    aliases: ['chipotle mexican grill'],
    tier: 1,
    category: 'Fast Casual',
    emoji: '🌯',
    blurb: 'Customizable bowls and burritos with whole ingredients and high-protein options.',
    popularityRank: 1,
    officialUrl: 'https://www.chipotle.com',
    nutritionSourceUrl: 'https://www.chipotle.com/nutrition-calculator',
    nutritionNote: 'Values reflect standard portions of each component. Use the official calculator for fully custom builds.',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: 'chicken-bowl', name: 'Chicken Burrito Bowl', category: 'Bowls', calories: 595, protein: 49, carbs: 65, fat: 19, fiber: 13, servingSize: 'White rice, black beans, chicken, salsa, lettuce', isPopular: true, goalTags: ['high-protein'] },
      { id: 'steak-bowl',   name: 'Steak Burrito Bowl',   category: 'Bowls', calories: 610, protein: 47, carbs: 65, fat: 22, fiber: 13, servingSize: 'White rice, black beans, steak, salsa, lettuce', isPopular: true, goalTags: ['high-protein'] },
      { id: 'sofritas-bowl',name: 'Sofritas Bowl',        category: 'Bowls', calories: 580, protein: 24, carbs: 75, fat: 22, fiber: 16, servingSize: 'White rice, black beans, sofritas, salsa, lettuce', goalTags: ['plant-based'] },
      { id: 'chicken-salad',name: 'Chicken Salad Bowl (No Rice)', category: 'Bowls', calories: 395, protein: 43, carbs: 27, fat: 14, fiber: 10, servingSize: 'Lettuce, black beans, chicken, salsa', isPopular: true, goalTags: ['high-protein', 'low-cal', 'low-carb'] },
      { id: 'chips-guac',   name: 'Chips & Guacamole',    category: 'Sides', calories: 770, protein: 9, carbs: 81, fat: 47, fiber: 11, isPopular: true },
      { id: 'guac-side',    name: 'Side of Guacamole',    category: 'Sides', calories: 230, protein: 2, carbs: 8, fat: 22, fiber: 6, goalTags: ['plant-based'] },
    ],
    // Ingredient-level breakdown — lets the AI compose custom builds and
    // handle "double chicken", "no rice", "extra guac", etc. with proper math.
    // All values per the official Chipotle nutrition calculator (one
    // standard portion as served by the line).
    components: [
      // Bases
      { id: 'white-rice',    name: 'White Rice',          category: 'base',    servingSize: '1 scoop (4 oz)', calories: 210, protein: 4, carbs: 40, fat: 4 },
      { id: 'brown-rice',    name: 'Brown Rice',          category: 'base',    servingSize: '1 scoop (4 oz)', calories: 210, protein: 5, carbs: 40, fat: 5 },
      { id: 'romaine',       name: 'Romaine Lettuce',     category: 'base',    servingSize: '1 scoop (2.5 oz)', calories: 5, protein: 1, carbs: 2, fat: 0 },
      // Proteins
      { id: 'chicken',       name: 'Chicken',             category: 'protein', servingSize: '1 portion (4 oz)', calories: 180, protein: 32, carbs: 0, fat: 7 },
      { id: 'chicken-al-pastor', name: 'Chicken al Pastor', category: 'protein', servingSize: '1 portion (4 oz)', calories: 200, protein: 32, carbs: 4, fat: 7 },
      { id: 'steak',         name: 'Steak',               category: 'protein', servingSize: '1 portion (4 oz)', calories: 190, protein: 29, carbs: 1, fat: 8 },
      { id: 'barbacoa',      name: 'Barbacoa',            category: 'protein', servingSize: '1 portion (4 oz)', calories: 170, protein: 24, carbs: 2, fat: 7 },
      { id: 'carnitas',      name: 'Carnitas',            category: 'protein', servingSize: '1 portion (4 oz)', calories: 210, protein: 23, carbs: 0, fat: 12 },
      { id: 'sofritas',      name: 'Sofritas',            category: 'protein', servingSize: '1 portion (4 oz)', calories: 150, protein: 8, carbs: 16, fat: 10, notes: 'Tofu-based, plant-friendly' },
      // Toppings
      { id: 'black-beans',   name: 'Black Beans',         category: 'topping', servingSize: '1 scoop (4 oz)', calories: 130, protein: 8, carbs: 22, fat: 2, fiber: 7 },
      { id: 'pinto-beans',   name: 'Pinto Beans',         category: 'topping', servingSize: '1 scoop (4 oz)', calories: 130, protein: 8, carbs: 21, fat: 2, fiber: 7 },
      { id: 'fajita-veg',    name: 'Fajita Vegetables',   category: 'topping', servingSize: '1 scoop (3 oz)', calories: 20, protein: 1, carbs: 4, fat: 0 },
      { id: 'cheese',        name: 'Cheese',              category: 'topping', servingSize: '1 oz',           calories: 110, protein: 6, carbs: 1, fat: 9 },
      { id: 'sour-cream',    name: 'Sour Cream',          category: 'topping', servingSize: '2 oz',           calories: 110, protein: 2, carbs: 2, fat: 9 },
      { id: 'guacamole',     name: 'Guacamole',           category: 'topping', servingSize: '4 oz',           calories: 230, protein: 2, carbs: 8, fat: 22, fiber: 6 },
      { id: 'queso-blanco',  name: 'Queso Blanco',        category: 'topping', servingSize: '2 oz',           calories: 120, protein: 5, carbs: 5, fat: 9 },
      // Salsas
      { id: 'salsa-tomato',  name: 'Fresh Tomato Salsa',  category: 'sauce',   servingSize: '3.5 oz',         calories: 25, protein: 1, carbs: 4, fat: 0 },
      { id: 'salsa-corn',    name: 'Roasted Chili-Corn Salsa', category: 'sauce', servingSize: '3 oz',        calories: 80, protein: 3, carbs: 16, fat: 1.5 },
      { id: 'salsa-green',   name: 'Tomatillo Green-Chili Salsa', category: 'sauce', servingSize: '2 oz',     calories: 15, protein: 1, carbs: 4, fat: 0 },
      { id: 'salsa-red',     name: 'Tomatillo Red-Chili Salsa',   category: 'sauce', servingSize: '2 oz',     calories: 30, protein: 1, carbs: 4, fat: 1 },
      // Extras
      { id: 'flour-tortilla',name: 'Flour Tortilla (Burrito)', category: 'extras', servingSize: '1 tortilla', calories: 320, protein: 8, carbs: 50, fat: 9 },
      { id: 'crispy-shells', name: 'Crispy Taco Shells (3)',   category: 'extras', servingSize: '3 shells',   calories: 180, protein: 3, carbs: 19, fat: 9 },
      { id: 'chips',         name: 'Chips',                    category: 'extras', servingSize: '1 bag (4 oz)', calories: 540, protein: 7, carbs: 73, fat: 25, fiber: 8 },
    ],
  },

  {
    id: 'huey-magoos',
    name: "Huey Magoo's Chicken Tenders",
    shortName: "Huey Magoo's",
    aliases: ['huey magoo', 'magoos', 'huey magoos', 'hueymagoos'],
    tier: 1,
    category: 'Fast Casual',
    emoji: '🍗',
    blurb: 'Grilled and crispy chicken tenders, cleaner protein options than typical fried chicken spots.',
    popularityRank: 2,
    officialUrl: 'https://www.hueymagoos.com',
    nutritionSourceUrl: 'https://www.hueymagoos.com/nutrition',
    nutritionNote: 'Tender macros are per piece — multiply by quantity ordered.',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: 'grilled-tender',   name: 'Grilled Tender (each)',  category: 'Tenders', calories: 70,  protein: 12, carbs: 0,  fat: 2,  servingSize: '1 piece', isPopular: true, goalTags: ['high-protein', 'low-carb'] },
      { id: 'crispy-tender',    name: 'Crispy Tender (each)',   category: 'Tenders', calories: 110, protein: 10, carbs: 7,  fat: 5,  servingSize: '1 piece', isPopular: true, goalTags: ['high-protein'] },
      { id: '5pc-grilled',      name: '5pc Grilled Tenders',    category: 'Combos',  calories: 350, protein: 60, carbs: 0,  fat: 10, servingSize: '5 pieces', isPopular: true, goalTags: ['high-protein', 'low-carb'] },
      { id: 'magoo-salad',      name: 'Magoo Salad (Grilled)',  category: 'Salads',  calories: 290, protein: 35, carbs: 12, fat: 12, fiber: 4, isPopular: true, goalTags: ['high-protein', 'low-cal'] },
      { id: 'fries-side',       name: 'Crinkle Fries (Regular)',category: 'Sides',   calories: 310, protein: 4,  carbs: 42, fat: 14 },
      { id: 'texas-toast',      name: 'Texas Toast',            category: 'Sides',   calories: 150, protein: 3,  carbs: 18, fat: 7 },
      { id: 'magoo-sauce',      name: 'Magoo Sauce (1oz)',      category: 'Sauces',  calories: 140, protein: 0,  carbs: 1,  fat: 15, servingSize: '1 oz' },
    ],
  },

  {
    id: 'sweetgreen',
    name: 'Sweetgreen',
    shortName: 'Sweetgreen',
    aliases: ['sweet green'],
    tier: 1,
    category: 'Fast Casual',
    emoji: '🥗',
    blurb: 'Customizable salads and warm bowls with locally sourced, seasonal ingredients.',
    popularityRank: 3,
    officialUrl: 'https://www.sweetgreen.com',
    nutritionSourceUrl: 'https://www.sweetgreen.com/menu',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: 'harvest-bowl',     name: 'Harvest Bowl',            category: 'Warm Bowls', calories: 705, protein: 30, carbs: 75, fat: 32, fiber: 11, servingSize: 'Chicken, wild rice, sweet potato, kale, apple, almonds, goat cheese', isPopular: true, goalTags: ['high-protein'] },
      { id: 'kale-caesar',      name: 'Kale Caesar',             category: 'Salads',     calories: 470, protein: 35, carbs: 24, fat: 25, fiber: 6,  servingSize: 'Chicken, kale, romaine, parmesan, croutons, lime', isPopular: true, goalTags: ['high-protein', 'low-carb'] },
      { id: 'guacamole-greens', name: 'Guacamole Greens',        category: 'Salads',     calories: 525, protein: 14, carbs: 47, fat: 33, fiber: 17, servingSize: 'Mesclun, romaine, avocado, tomato, tortilla, lime' },
      { id: 'shroomami',        name: 'Shroomami',               category: 'Warm Bowls', calories: 530, protein: 19, carbs: 60, fat: 25, fiber: 9,  servingSize: 'Tofu, mushrooms, wild rice, kale, cucumber, sesame', goalTags: ['plant-based'] },
      { id: 'fish-taco-bowl',   name: 'Fish Taco Bowl',          category: 'Warm Bowls', calories: 690, protein: 35, carbs: 65, fat: 30, fiber: 12, isPopular: true, goalTags: ['high-protein'] },
    ],
    // Ingredient-level breakdown — Sweetgreen bowls are highly customizable.
    components: [
      // Bases (greens + grains)
      { id: 'arugula',           name: 'Arugula',                category: 'base',    servingSize: '3 oz', calories: 15,  protein: 1,  carbs: 2,  fat: 0 },
      { id: 'romaine',           name: 'Romaine',                category: 'base',    servingSize: '3 oz', calories: 15,  protein: 1,  carbs: 3,  fat: 0 },
      { id: 'spinach',           name: 'Baby Spinach',           category: 'base',    servingSize: '3 oz', calories: 20,  protein: 2,  carbs: 3,  fat: 0 },
      { id: 'kale',              name: 'Shredded Kale',          category: 'base',    servingSize: '3 oz', calories: 50,  protein: 3,  carbs: 8,  fat: 1 },
      { id: 'wild-rice',         name: 'Warm Wild Rice',         category: 'base',    servingSize: '4 oz', calories: 220, protein: 5,  carbs: 47, fat: 1 },
      { id: 'quinoa',            name: 'Warm Quinoa',            category: 'base',    servingSize: '4 oz', calories: 220, protein: 7,  carbs: 40, fat: 4 },
      // Proteins
      { id: 'sg-chicken',        name: 'Roasted Chicken',        category: 'protein', servingSize: '4 oz', calories: 150, protein: 30, carbs: 0,  fat: 4 },
      { id: 'sg-blackened-chx',  name: 'Blackened Chicken',      category: 'protein', servingSize: '4 oz', calories: 160, protein: 28, carbs: 1,  fat: 5 },
      { id: 'sg-steelhead',      name: 'Steelhead (Salmon)',     category: 'protein', servingSize: '3 oz', calories: 175, protein: 23, carbs: 0,  fat: 9 },
      { id: 'sg-tofu',           name: 'Tofu',                   category: 'protein', servingSize: '4 oz', calories: 100, protein: 9,  carbs: 5,  fat: 5, notes: 'Plant-friendly' },
      { id: 'sg-falafel',        name: 'Falafel (4 balls)',      category: 'protein', servingSize: '4 balls', calories: 230, protein: 7,  carbs: 25, fat: 12, notes: 'Plant-friendly' },
      // Toppings
      { id: 'sg-sweet-potato',   name: 'Roasted Sweet Potato',   category: 'topping', servingSize: '3 oz', calories: 80,  protein: 1,  carbs: 19, fat: 0 },
      { id: 'sg-broccoli',       name: 'Roasted Broccoli',       category: 'topping', servingSize: '3 oz', calories: 80,  protein: 4,  carbs: 10, fat: 4 },
      { id: 'sg-corn',           name: 'Hot Honey Corn',         category: 'topping', servingSize: '3 oz', calories: 75,  protein: 3,  carbs: 17, fat: 1 },
      { id: 'sg-avocado',        name: 'Avocado',                category: 'topping', servingSize: '1/4 avo', calories: 80,  protein: 1,  carbs: 4,  fat: 7 },
      { id: 'sg-goat-cheese',    name: 'Goat Cheese',            category: 'topping', servingSize: '1 oz', calories: 100, protein: 5,  carbs: 1,  fat: 8 },
      { id: 'sg-feta',           name: 'Feta',                   category: 'topping', servingSize: '1 oz', calories: 80,  protein: 4,  carbs: 1,  fat: 6 },
      // Crunch
      { id: 'sg-parm-crisps',    name: 'Parmesan Crisps',        category: 'extras',  servingSize: '0.5 oz', calories: 130, protein: 13, carbs: 0,  fat: 9 },
      { id: 'sg-tortilla-chips', name: 'Spicy Tortilla Chips',   category: 'extras',  servingSize: '0.5 oz', calories: 110, protein: 1,  carbs: 13, fat: 6 },
      { id: 'sg-pita-chips',     name: 'Pita Chips',             category: 'extras',  servingSize: '0.5 oz', calories: 90,  protein: 2,  carbs: 13, fat: 4 },
      // Dressings
      { id: 'sg-sesame-ginger',  name: 'Sweet Sesame Ginger',    category: 'sauce',   servingSize: '1 oz', calories: 130, protein: 0,  carbs: 4,  fat: 12 },
      { id: 'sg-caesar',         name: 'Caesar Dressing',        category: 'sauce',   servingSize: '1 oz', calories: 150, protein: 1,  carbs: 1,  fat: 15 },
      { id: 'sg-tahini-herb',    name: 'Tahini Herb',            category: 'sauce',   servingSize: '1 oz', calories: 110, protein: 2,  carbs: 4,  fat: 9 },
      { id: 'sg-balsamic',       name: 'Balsamic Vinaigrette',   category: 'sauce',   servingSize: '1 oz', calories: 80,  protein: 0,  carbs: 6,  fat: 7 },
      { id: 'sg-lime-cilantro',  name: 'Lime Cilantro Jalapeño', category: 'sauce',   servingSize: '1 oz', calories: 100, protein: 0,  carbs: 3,  fat: 11 },
    ],
  },

  {
    id: 'panera',
    name: 'Panera Bread',
    shortName: 'Panera',
    aliases: ['panera bread'],
    tier: 1,
    category: 'Bakery-Cafe',
    emoji: '🥖',
    blurb: 'Soups, salads, sandwiches, and grain bowls with a clean-ingredient menu.',
    popularityRank: 4,
    officialUrl: 'https://www.panerabread.com',
    nutritionSourceUrl: 'https://www.panerabread.com/en-us/menu/nutrition.html',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: 'greek-chicken',       name: 'Greek Salad with Chicken',        category: 'Salads',     calories: 510, protein: 31, carbs: 23, fat: 33, fiber: 7,  isPopular: true, goalTags: ['high-protein', 'low-carb'] },
      { id: 'steak-cobb-avo',      name: 'Steak Cobb with Avocado',         category: 'Salads',     calories: 580, protein: 39, carbs: 23, fat: 36, fiber: 10, isPopular: true, goalTags: ['high-protein'] },
      { id: 'med-veggie-half',     name: 'Mediterranean Veggie (Half)',     category: 'Sandwiches', calories: 290, protein: 11, carbs: 47, fat: 7,  fiber: 7,  goalTags: ['plant-based'] },
      { id: 'broc-cheddar-cup',    name: 'Broccoli Cheddar Soup (Cup)',     category: 'Soups',      calories: 240, protein: 11, carbs: 17, fat: 14, fiber: 3, isPopular: true },
      { id: 'ten-veg-cup',         name: '10 Vegetable Soup (Cup)',         category: 'Soups',      calories: 70,  protein: 3,  carbs: 14, fat: 2,  fiber: 4, goalTags: ['low-cal', 'plant-based'] },
      { id: 'chicken-bacon-grain', name: 'Baja Bowl with Chicken',          category: 'Bowls',      calories: 580, protein: 35, carbs: 56, fat: 23, fiber: 13, isPopular: true, goalTags: ['high-protein'] },
    ],
  },

  // ==========================================================================
  //  TIER 2 — Above Average
  // ==========================================================================
  {
    id: 'chick-fil-a',
    name: 'Chick-fil-A',
    shortName: 'Chick-fil-A',
    aliases: ['chick fil a', 'chickfila', 'chic fil a', 'chic-fil-a'],
    tier: 2,
    category: 'Fast Food',
    emoji: '🐔',
    blurb: 'Grilled chicken options stand out — sauces and sides pull macros up if you let them.',
    popularityRank: 5,
    officialUrl: 'https://www.chick-fil-a.com',
    nutritionSourceUrl: 'https://www.chick-fil-a.com/menu/nutrition',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: 'grilled-nuggets-8',   name: 'Grilled Nuggets (8 ct)',         category: 'Mains',    calories: 130, protein: 25, carbs: 1,  fat: 3,  isPopular: true, goalTags: ['high-protein', 'low-cal', 'low-carb'] },
      { id: 'grilled-nuggets-12',  name: 'Grilled Nuggets (12 ct)',        category: 'Mains',    calories: 200, protein: 38, carbs: 2,  fat: 4.5, isPopular: true, goalTags: ['high-protein', 'low-carb'] },
      { id: 'grilled-sandwich',    name: 'Grilled Chicken Sandwich',       category: 'Sandwiches', calories: 390, protein: 28, carbs: 44, fat: 12, isPopular: true, goalTags: ['high-protein'] },
      { id: 'spicy-sandwich',      name: 'Spicy Chicken Sandwich',         category: 'Sandwiches', calories: 450, protein: 28, carbs: 45, fat: 19, isPopular: true, goalTags: ['high-protein'] },
      { id: 'cobb-salad-grilled',  name: 'Cobb Salad with Grilled Chicken',category: 'Salads',   calories: 430, protein: 36, carbs: 26, fat: 22, fiber: 7, goalTags: ['high-protein'] },
      { id: 'mac-and-cheese',      name: 'Mac & Cheese (Medium)',          category: 'Sides',    calories: 450, protein: 19, carbs: 38, fat: 26 },
      { id: 'side-salad',          name: 'Side Salad',                     category: 'Sides',    calories: 80,  protein: 5,  carbs: 5,  fat: 4,  goalTags: ['low-cal'] },
      { id: 'waffle-fries-medium', name: 'Waffle Fries (Medium)',          category: 'Sides',    calories: 420, protein: 5,  carbs: 49, fat: 24 },
    ],
  },

  {
    id: 'subway',
    name: 'Subway',
    shortName: 'Subway',
    tier: 2,
    category: 'Subs',
    emoji: '🥪',
    blurb: 'Build-your-own subs and bowls — load up on veggies and lean proteins to stay on track.',
    popularityRank: 6,
    officialUrl: 'https://www.subway.com',
    nutritionSourceUrl: 'https://www.subway.com/en-us/menunutrition/nutrition',
    nutritionNote: 'Values reflect 6" subs on Italian Herbs & Cheese bread with standard veggies. Choose 9-grain wheat to lower fat.',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: 'turkey-6',            name: '6" Turkey Breast',               category: 'Subs',  calories: 280, protein: 18, carbs: 41, fat: 4.5, isPopular: true, goalTags: ['low-cal'] },
      { id: 'subway-club-6',       name: '6" Subway Club',                 category: 'Subs',  calories: 310, protein: 24, carbs: 45, fat: 4.5, isPopular: true, goalTags: ['high-protein'] },
      { id: 'rotisserie-6',        name: '6" Rotisserie-Style Chicken',    category: 'Subs',  calories: 350, protein: 29, carbs: 41, fat: 7,   isPopular: true, goalTags: ['high-protein'] },
      { id: 'steak-cheese-6',      name: '6" Steak & Cheese',              category: 'Subs',  calories: 380, protein: 27, carbs: 45, fat: 9, goalTags: ['high-protein'] },
      { id: 'italian-bmt-6',       name: '6" Italian B.M.T.',              category: 'Subs',  calories: 410, protein: 21, carbs: 43, fat: 17 },
      { id: 'chicken-bowl',        name: 'Chicken Protein Bowl',           category: 'Bowls', calories: 320, protein: 33, carbs: 20, fat: 13, isPopular: true, goalTags: ['high-protein', 'low-carb'] },
    ],
  },

  {
    id: 'jersey-mikes',
    name: "Jersey Mike's Subs",
    shortName: "Jersey Mike's",
    aliases: ['jersey mikes', 'jersey mike'],
    tier: 2,
    category: 'Subs',
    emoji: '🥖',
    blurb: 'Fresh-sliced subs — go "Sub In a Tub" (no bread) for a high-protein cut.',
    popularityRank: 7,
    officialUrl: 'https://www.jerseymikes.com',
    nutritionSourceUrl: 'https://www.jerseymikes.com/nutrition',
    nutritionNote: '"Mike\'s Way" = onions, lettuce, tomato, oil, vinegar, spices. "Sub In a Tub" replaces bread with a lettuce bowl.',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: 'turkey-reg-mikesway',   name: 'Turkey & Provolone (Reg, Mike\'s Way)', category: 'Subs',           calories: 580, protein: 25, carbs: 56, fat: 25, isPopular: true },
      { id: 'roast-beef-reg',        name: 'Roast Beef & Provolone (Reg)',          category: 'Subs',           calories: 614, protein: 36, carbs: 53, fat: 28, goalTags: ['high-protein'] },
      { id: 'turkey-tub',            name: 'Turkey Provolone (Sub In a Tub)',       category: 'Sub In a Tub',   calories: 280, protein: 25, carbs: 4,  fat: 17, isPopular: true, goalTags: ['high-protein', 'low-carb'] },
      { id: 'club-supreme-tub',      name: 'Club Supreme (Sub In a Tub)',           category: 'Sub In a Tub',   calories: 470, protein: 39, carbs: 7,  fat: 31, goalTags: ['high-protein', 'low-carb'] },
      { id: 'chicken-philly-reg',    name: 'Chicken Philly (Reg)',                  category: 'Hot Subs',       calories: 760, protein: 50, carbs: 64, fat: 30, isPopular: true, goalTags: ['high-protein'] },
    ],
  },

  // ==========================================================================
  //  TIER 3 — Navigate Carefully
  // ==========================================================================
  {
    id: 'starbucks',
    name: 'Starbucks',
    shortName: 'Starbucks',
    aliases: ['sbux'],
    tier: 3,
    category: 'Coffee',
    emoji: '☕',
    blurb: 'Coffee drinks vary wildly in calories — protein boxes are reliable picks.',
    popularityRank: 8,
    officialUrl: 'https://www.starbucks.com',
    nutritionSourceUrl: 'https://www.starbucks.com/menu',
    nutritionNote: 'Grande sizes shown unless noted. Substitute non-fat or oat milk to adjust macros.',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: 'cold-brew',           name: 'Grande Cold Brew (Black)',           category: 'Drinks',    calories: 5,   protein: 0,  carbs: 1,  fat: 0,  isPopular: true, goalTags: ['low-cal'] },
      { id: 'americano',           name: 'Grande Caffè Americano',             category: 'Drinks',    calories: 15,  protein: 1,  carbs: 3,  fat: 0,  goalTags: ['low-cal'] },
      { id: 'latte-whole',         name: 'Grande Latte (Whole Milk)',          category: 'Drinks',    calories: 190, protein: 12, carbs: 18, fat: 7,  isPopular: true },
      { id: 'latte-oat',           name: 'Grande Latte (Oat Milk)',            category: 'Drinks',    calories: 210, protein: 4,  carbs: 30, fat: 8 },
      { id: 'protein-eggs-cheese', name: 'Protein Box: Eggs & Cheese',         category: 'Protein Boxes', calories: 460, protein: 25, carbs: 33, fat: 25, isPopular: true, goalTags: ['high-protein'] },
      { id: 'protein-chicken',     name: 'Protein Box: Chicken & Quinoa',      category: 'Protein Boxes', calories: 420, protein: 30, carbs: 41, fat: 17, isPopular: true, goalTags: ['high-protein'] },
      { id: 'spinach-feta-wrap',   name: 'Spinach, Feta & Egg White Wrap',     category: 'Breakfast', calories: 290, protein: 19, carbs: 33, fat: 8,  isPopular: true, goalTags: ['high-protein'] },
    ],
  },

  // ==========================================================================
  //  TIER 1 — Healthiest (continued)
  // ==========================================================================
  {
    id: 'fresh-kitchen',
    name: 'Fresh Kitchen',
    shortName: 'Fresh Kitchen',
    aliases: ['freshkitchen'],
    tier: 1,
    category: 'Fast Casual',
    emoji: '🥗',
    blurb: 'Build-your-own macro bowls — fresh proteins, whole grains, real vegetables.',
    popularityRank: 9,
    officialUrl: 'https://www.freshkitchen.com',
    nutritionSourceUrl: 'https://www.freshkitchen.com/menu',
    nutritionNote: 'Bowls are built from base + protein + vegetables + sauce. Macros vary by build.',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: 'chicken-power-bowl', name: 'Chicken Power Bowl',  category: 'Bowls', calories: 580, protein: 45, carbs: 60, fat: 18, fiber: 9,  servingSize: 'Chicken, brown rice, broccoli, kale, garlic sauce', isPopular: true, goalTags: ['high-protein'] },
      { id: 'steak-bowl',         name: 'Steak Bowl',          category: 'Bowls', calories: 620, protein: 38, carbs: 55, fat: 22, fiber: 8,  servingSize: 'Steak, sweet potato, brussels, mushrooms, romesco', isPopular: true, goalTags: ['high-protein'] },
      { id: 'salmon-bowl',        name: 'Salmon Bowl',         category: 'Bowls', calories: 600, protein: 38, carbs: 48, fat: 24, fiber: 8,  servingSize: 'Salmon, quinoa, kale, broccoli, lemon tahini', goalTags: ['high-protein'] },
      { id: 'korean-bbq-beef',    name: 'Korean BBQ Beef Bowl',category: 'Bowls', calories: 640, protein: 35, carbs: 65, fat: 23, fiber: 7,  isPopular: true },
      { id: 'buddha-bowl',        name: 'Buddha Bowl',         category: 'Bowls', calories: 510, protein: 15, carbs: 75, fat: 16, fiber: 12, servingSize: 'Vegetarian — quinoa, sweet potato, brussels, kale', goalTags: ['plant-based'] },
    ],
  },

  {
    id: 'cava',
    name: 'Cava',
    shortName: 'Cava',
    aliases: ['kava'],
    tier: 1,
    category: 'Fast Casual',
    emoji: '🫒',
    blurb: 'Mediterranean bowls and pitas with grilled proteins, hummus, and bright vegetables.',
    popularityRank: 10,
    officialUrl: 'https://cava.com',
    nutritionSourceUrl: 'https://cava.com/nutrition',
    nutritionNote: 'Builds are fully customizable. Values reflect typical "Greek salad" or "Crazy Feta" combinations.',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: 'greek-chicken-bowl', name: 'Greek Salad Bowl w/ Chicken', category: 'Bowls',   calories: 510, protein: 39, carbs: 25, fat: 28, fiber: 6,  servingSize: 'Greens, chicken, cucumber, tomato, feta, tzatziki', isPopular: true, goalTags: ['high-protein', 'low-carb'] },
      { id: 'crazy-feta-bowl',    name: 'Crazy Feta Bowl',             category: 'Bowls',   calories: 620, protein: 35, carbs: 55, fat: 28, fiber: 9,  servingSize: 'Chicken, harissa roasted veg, feta, pita chips', isPopular: true, goalTags: ['high-protein'] },
      { id: 'mediterranean-bowl', name: 'Mediterranean Bowl',          category: 'Bowls',   calories: 580, protein: 33, carbs: 62, fat: 24, fiber: 11, servingSize: 'Chicken, hummus, tabbouleh, fattoush', goalTags: ['high-protein'] },
      { id: 'falafel-bowl',       name: 'Falafel Bowl',                category: 'Bowls',   calories: 540, protein: 22, carbs: 76, fat: 17, fiber: 13, goalTags: ['plant-based'] },
      { id: 'pita-side',          name: 'Pita Bread (Side)',           category: 'Sides',   calories: 180, protein: 7,  carbs: 36, fat: 1,  fiber: 2 },
    ],
  },

  {
    id: 'tropical-smoothie',
    name: 'Tropical Smoothie Café',
    shortName: 'Tropical Smoothie',
    aliases: ['tropical smoothie cafe', 'tropicalsmoothie'],
    tier: 1,
    category: 'Smoothies & Cafe',
    emoji: '🥭',
    blurb: 'Real-fruit smoothies and lighter wraps/flatbreads — watch added sugar on some smoothies.',
    popularityRank: 11,
    officialUrl: 'https://www.tropicalsmoothiecafe.com',
    nutritionSourceUrl: 'https://www.tropicalsmoothiecafe.com/menu/nutrition',
    nutritionNote: '24oz smoothie sizes. Sub Splenda or no-added-sugar for cleaner macros.',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: 'detox-island-green',     name: 'Detox Island Green Smoothie (24oz)', category: 'Smoothies', calories: 270, protein: 5,  carbs: 64, fat: 1,  fiber: 7, isPopular: true, goalTags: ['low-cal', 'plant-based'] },
      { id: 'avocolada',              name: 'Avocolada Smoothie (24oz)',          category: 'Smoothies', calories: 510, protein: 8,  carbs: 89, fat: 16 },
      { id: 'power-smoothie',         name: 'Muscle Blaster Smoothie (24oz)',     category: 'Smoothies', calories: 420, protein: 32, carbs: 65, fat: 4,  isPopular: true, goalTags: ['high-protein'] },
      { id: 'chicken-bacon-ranch-wrap',  name: 'Chicken Bacon Ranch Wrap',        category: 'Food',      calories: 580, protein: 35, carbs: 53, fat: 25, isPopular: true, goalTags: ['high-protein'] },
      { id: 'chicken-bacon-ranch-flat', name: 'Chicken Bacon Ranch Flatbread',    category: 'Food',      calories: 510, protein: 28, carbs: 47, fat: 21, isPopular: true, goalTags: ['high-protein'] },
      { id: 'chicken-pesto-flat',     name: 'Chicken Pesto Flatbread',            category: 'Food',      calories: 650, protein: 36, carbs: 64, fat: 28, goalTags: ['high-protein'] },
    ],
  },

  {
    id: 'cosi',
    name: 'Così',
    shortName: 'Cosi',
    aliases: ['cosi cafe'],
    tier: 1,
    category: 'Bakery-Cafe',
    emoji: '🥪',
    blurb: 'Flatbread sandwiches, salads, and soups — generally cleaner ingredients than typical cafes.',
    popularityRank: 12,
    officialUrl: 'https://www.getcosi.com',
    nutritionSourceUrl: 'https://www.getcosi.com/nutrition',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: 'tandoori-chicken-salad', name: 'Tandoori Chicken Salad', category: 'Salads',     calories: 380, protein: 30, carbs: 25, fat: 16, fiber: 6, isPopular: true, goalTags: ['high-protein', 'low-cal'] },
      { id: 'signature-salad-chx',    name: 'Signature Salad w/ Chicken', category: 'Salads', calories: 440, protein: 28, carbs: 32, fat: 22, fiber: 7, goalTags: ['high-protein'] },
      { id: 'tbm-sandwich',           name: 'TBM (Turkey/Bacon/Mozz)', category: 'Sandwiches', calories: 590, protein: 32, carbs: 55, fat: 26, isPopular: true },
      { id: 'hummus-veggie-wrap',     name: 'Hummus & Veggie Wrap',    category: 'Sandwiches', calories: 470, protein: 14, carbs: 62, fat: 18, fiber: 10, goalTags: ['plant-based'] },
      { id: 'tomato-basil-cup',       name: 'Tomato Basil Soup (Cup)', category: 'Soups',      calories: 200, protein: 5,  carbs: 24, fat: 9 },
    ],
  },

  // ==========================================================================
  //  TIER 2 — Above Average (continued)
  // ==========================================================================
  {
    id: 'moes',
    name: "Moe's Southwest Grill",
    shortName: "Moe's",
    aliases: ['moes southwest grill', 'moes'],
    tier: 2,
    category: 'Fast Casual',
    emoji: '🌶️',
    blurb: 'Chipotle-style customization — bowls and burritos with grilled proteins.',
    popularityRank: 13,
    officialUrl: 'https://www.moes.com',
    nutritionSourceUrl: 'https://www.moes.com/menu/nutrition',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: 'homewrecker-bowl-chx', name: 'Homewrecker Bowl w/ Chicken', category: 'Bowls',    calories: 730, protein: 50, carbs: 75, fat: 22, fiber: 14, isPopular: true, goalTags: ['high-protein'] },
      { id: 'burrito-bowl-chx',     name: 'Burrito Bowl w/ Chicken',     category: 'Bowls',    calories: 660, protein: 48, carbs: 68, fat: 18, fiber: 13, isPopular: true, goalTags: ['high-protein'] },
      { id: 'adobo-chicken-tacos',  name: 'Adobo Chicken Tacos (2)',     category: 'Tacos',    calories: 420, protein: 32, carbs: 38, fat: 15, fiber: 6 },
      { id: 'joey-bag-chx',         name: "Joey Bag w/ Chicken (Burrito)", category: 'Burritos', calories: 600, protein: 38, carbs: 65, fat: 18, fiber: 11 },
      { id: 'chips-queso',          name: 'Chips & Queso',               category: 'Sides',    calories: 580, protein: 12, carbs: 60, fat: 32, isPopular: true },
    ],
  },

  {
    id: 'qdoba',
    name: 'Qdoba Mexican Eats',
    shortName: 'Qdoba',
    tier: 2,
    category: 'Fast Casual',
    emoji: '🌮',
    blurb: 'Customizable bowls and burritos — sodium runs high but macro-trackable.',
    popularityRank: 14,
    officialUrl: 'https://www.qdoba.com',
    nutritionSourceUrl: 'https://www.qdoba.com/nutrition-calculator',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: 'chicken-burrito-bowl', name: 'Chicken Burrito Bowl',   category: 'Bowls', calories: 640, protein: 47, carbs: 70, fat: 18, fiber: 13, isPopular: true, goalTags: ['high-protein'] },
      { id: 'adobo-steak-bowl',     name: 'Adobo Steak Bowl',       category: 'Bowls', calories: 670, protein: 43, carbs: 65, fat: 24, fiber: 13 },
      { id: 'grilled-chicken-salad',name: 'Grilled Chicken Salad',  category: 'Salads',calories: 470, protein: 40, carbs: 36, fat: 18, fiber: 10, isPopular: true, goalTags: ['high-protein', 'low-carb'] },
      { id: 'impossible-bowl',      name: 'Impossible Bowl',        category: 'Bowls', calories: 580, protein: 25, carbs: 78, fat: 20, fiber: 14, goalTags: ['plant-based'] },
      { id: 'queso-3oz',            name: '3-Cheese Queso (3oz)',   category: 'Sides', calories: 200, protein: 8,  carbs: 8,  fat: 16 },
    ],
  },

  {
    id: 'wingstop',
    name: 'Wingstop',
    shortName: 'Wingstop',
    tier: 2,
    category: 'Wings',
    emoji: '🍗',
    blurb: 'Wings are fried — pick dry rubs over heavy sauces and skip the fries to stay reasonable.',
    popularityRank: 15,
    officialUrl: 'https://www.wingstop.com',
    nutritionSourceUrl: 'https://www.wingstop.com/nutrition',
    nutritionNote: 'All wings are fried at Wingstop. Macros below are per typical serving with classic rubs.',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: 'classic-wings-5-lp',   name: '5 Classic Wings (Lemon Pepper)', category: 'Wings', calories: 460, protein: 38, carbs: 1,  fat: 33, isPopular: true, goalTags: ['high-protein', 'low-carb'] },
      { id: 'boneless-wings-6',     name: '6 Boneless Wings (Plain)',       category: 'Wings', calories: 410, protein: 30, carbs: 28, fat: 19, isPopular: true, goalTags: ['high-protein'] },
      { id: 'classic-wings-5-hawaiian', name: '5 Classic Wings (Hawaiian)', category: 'Wings', calories: 540, protein: 38, carbs: 22, fat: 33 },
      { id: 'veggie-sticks',        name: 'Veggie Sticks',                  category: 'Sides', calories: 80,  protein: 1,  carbs: 10, fat: 4,  goalTags: ['low-cal'] },
      { id: 'cajun-corn',           name: 'Cajun Fried Corn',               category: 'Sides', calories: 230, protein: 4,  carbs: 35, fat: 9 },
    ],
  },

  {
    id: 'jamba',
    name: 'Jamba',
    shortName: 'Jamba',
    aliases: ['jamba juice'],
    tier: 2,
    category: 'Smoothies',
    emoji: '🥤',
    blurb: 'Real-fruit smoothies and bowls — watch sugar content, opt for protein-boosted versions.',
    popularityRank: 16,
    officialUrl: 'https://www.jamba.com',
    nutritionSourceUrl: 'https://www.jamba.com/menu/nutrition',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: 'pure-protein-mango',   name: 'Pure Protein Mango (16oz)',      category: 'Smoothies', calories: 240, protein: 21, carbs: 38, fat: 2,  isPopular: true, goalTags: ['high-protein'] },
      { id: 'greens-ginger',        name: "Greens 'n Ginger (24oz)",        category: 'Smoothies', calories: 200, protein: 4,  carbs: 49, fat: 1,  goalTags: ['low-cal', 'plant-based'] },
      { id: 'mango-a-go-go',        name: 'Mango-A-Go-Go (24oz)',           category: 'Smoothies', calories: 360, protein: 4,  carbs: 86, fat: 1,  isPopular: true },
      { id: 'acai-primo-bowl',      name: 'Açaí Primo Bowl',                category: 'Bowls',     calories: 540, protein: 8,  carbs: 105,fat: 11, fiber: 15 },
      { id: 'power-smoothie',       name: 'Power Smoothie (24oz)',          category: 'Smoothies', calories: 380, protein: 16, carbs: 75, fat: 2,  goalTags: ['high-protein'] },
    ],
  },

  {
    id: 'jasons-deli',
    name: "Jason's Deli",
    shortName: "Jason's Deli",
    aliases: ['jasons deli', 'jason deli'],
    tier: 2,
    category: 'Deli & Cafe',
    emoji: '🥗',
    blurb: 'Sandwich + salad bar concept — organic options and the salad bar are the wins.',
    popularityRank: 17,
    officialUrl: 'https://www.jasonsdeli.com',
    nutritionSourceUrl: 'https://www.jasonsdeli.com/nutrition',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: 'chicken-club-salad',   name: 'Chicken Club Salad',          category: 'Salads',     calories: 420, protein: 38, carbs: 16, fat: 24, fiber: 5, isPopular: true, goalTags: ['high-protein', 'low-carb'] },
      { id: 'plain-jane-spud',      name: 'Plain Jane Spud (Stuffed Potato)', category: 'Mains', calories: 560, protein: 22, carbs: 80, fat: 18, fiber: 10 },
      { id: 'pollo-mexicano-wrap',  name: 'Pollo Mexicano Wrap',         category: 'Wraps',      calories: 440, protein: 30, carbs: 55, fat: 14, goalTags: ['high-protein'] },
      { id: 'spinach-veggie-wrap',  name: 'Spinach Veggie Wrap',         category: 'Wraps',      calories: 430, protein: 12, carbs: 64, fat: 18, fiber: 9, goalTags: ['plant-based'] },
      { id: 'salad-bar-half',       name: 'Salad Bar (Half-Pound)',      category: 'Salad Bar',  calories: 190, protein: 5,  carbs: 28, fat: 6,  isPopular: true, goalTags: ['low-cal'] },
    ],
  },

  {
    id: 'noodles',
    name: 'Noodles & Company',
    shortName: 'Noodles & Co',
    aliases: ['noodles and company', 'noodlescompany'],
    tier: 2,
    category: 'Pasta & Noodles',
    emoji: '🍜',
    blurb: 'Pasta and noodle bowls — zoodle swaps and Asian dishes are the macro-friendly picks.',
    popularityRank: 18,
    officialUrl: 'https://www.noodles.com',
    nutritionSourceUrl: 'https://www.noodles.com/nutrition',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: 'zoodle-pad-thai-chx',  name: 'Zoodle Pad Thai w/ Chicken (Reg)', category: 'Bowls', calories: 480, protein: 36, carbs: 35, fat: 23, fiber: 6, isPopular: true, goalTags: ['high-protein', 'low-carb'] },
      { id: 'pad-thai-chx-reg',     name: 'Pad Thai w/ Chicken (Reg)',     category: 'Bowls', calories: 770, protein: 38, carbs: 92, fat: 28 },
      { id: 'penne-rosa-chx',       name: 'Penne Rosa w/ Chicken (Reg)',   category: 'Pasta', calories: 750, protein: 39, carbs: 78, fat: 32, isPopular: true },
      { id: 'wisconsin-mac',        name: 'Wisconsin Mac & Cheese (Reg)',  category: 'Pasta', calories: 800, protein: 27, carbs: 86, fat: 38 },
      { id: 'lettuce-wraps-4',      name: 'Asian Lettuce Wraps (4)',       category: 'Starters', calories: 320, protein: 13, carbs: 44, fat: 11, goalTags: ['low-cal'] },
    ],
  },

  // ==========================================================================
  //  TIER 3 — Navigate Carefully (continued)
  // ==========================================================================
  {
    id: 'mcdonalds',
    name: "McDonald's",
    shortName: "McDonald's",
    aliases: ['mcdonalds', 'mickey d', 'mcds'],
    tier: 3,
    category: 'Fast Food',
    emoji: '🍟',
    blurb: 'Most items are calorie-dense. Grilled chicken sandwich and Egg McMuffin are reasonable picks.',
    popularityRank: 19,
    officialUrl: 'https://www.mcdonalds.com',
    nutritionSourceUrl: 'https://www.mcdonalds.com/us/en-us/about-our-food/nutrition-calculator.html',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: 'egg-mcmuffin',         name: 'Egg McMuffin',                 category: 'Breakfast',  calories: 310, protein: 17, carbs: 30, fat: 13, isPopular: true, goalTags: ['high-protein'] },
      { id: 'big-mac',              name: 'Big Mac',                      category: 'Burgers',    calories: 590, protein: 25, carbs: 45, fat: 33, isPopular: true },
      { id: 'qpc',                  name: 'Quarter Pounder w/ Cheese',    category: 'Burgers',    calories: 520, protein: 30, carbs: 42, fat: 26, isPopular: true },
      { id: 'filet-o-fish',         name: 'Filet-O-Fish',                 category: 'Sandwiches', calories: 390, protein: 16, carbs: 39, fat: 19 },
      { id: 'mcnuggets-10',         name: '10pc Chicken McNuggets',       category: 'Mains',      calories: 410, protein: 23, carbs: 26, fat: 24, isPopular: true },
      { id: 'fries-medium',         name: 'World Famous Fries (Medium)',  category: 'Sides',      calories: 320, protein: 4,  carbs: 43, fat: 15 },
      { id: 'side-salad',           name: 'Side Salad',                   category: 'Sides',      calories: 15,  protein: 1,  carbs: 3,  fat: 0,  goalTags: ['low-cal'] },
    ],
  },

  {
    id: 'wendys',
    name: "Wendy's",
    shortName: "Wendy's",
    aliases: ['wendys'],
    tier: 3,
    category: 'Fast Food',
    emoji: '🍔',
    blurb: 'Fresh beef and a few solid grilled chicken options — most combos still run high.',
    popularityRank: 20,
    officialUrl: 'https://www.wendys.com',
    nutritionSourceUrl: 'https://order.wendys.com/nutrition',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: 'grilled-chicken-sand', name: 'Grilled Chicken Sandwich',     category: 'Sandwiches', calories: 360, protein: 33, carbs: 36, fat: 9,  isPopular: true, goalTags: ['high-protein'] },
      { id: 'daves-single',         name: "Dave's Single",                category: 'Burgers',    calories: 580, protein: 30, carbs: 38, fat: 35, isPopular: true },
      { id: 'spicy-chicken-sand',   name: 'Spicy Chicken Sandwich',       category: 'Sandwiches', calories: 490, protein: 28, carbs: 51, fat: 19 },
      { id: 'apple-pecan-salad',    name: 'Apple Pecan Salad (Full)',     category: 'Salads',     calories: 540, protein: 34, carbs: 38, fat: 28, fiber: 6, goalTags: ['high-protein'] },
      { id: 'baconator',            name: 'Baconator',                    category: 'Burgers',    calories: 950, protein: 60, carbs: 38, fat: 60 },
      { id: 'baked-potato-plain',   name: 'Plain Baked Potato',           category: 'Sides',      calories: 270, protein: 7,  carbs: 61, fat: 0,  goalTags: ['low-cal', 'plant-based'] },
    ],
  },

  {
    id: 'taco-bell',
    name: 'Taco Bell',
    shortName: 'Taco Bell',
    aliases: ['tacobell'],
    tier: 3,
    category: 'Fast Food',
    emoji: '🌮',
    blurb: 'Surprisingly macro-customizable — Fresco style and Power Bowls are the picks.',
    popularityRank: 21,
    officialUrl: 'https://www.tacobell.com',
    nutritionSourceUrl: 'https://www.tacobell.com/nutrition',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: 'power-bowl-chx',       name: 'Power Menu Bowl w/ Chicken',   category: 'Bowls',      calories: 480, protein: 26, carbs: 50, fat: 19, fiber: 7,  isPopular: true, goalTags: ['high-protein'] },
      { id: 'fresco-soft-taco-chx', name: 'Fresco Soft Taco (Chicken)',   category: 'Tacos',      calories: 140, protein: 11, carbs: 17, fat: 3.5, isPopular: true, goalTags: ['low-cal', 'high-protein'] },
      { id: 'crunchy-taco',         name: 'Crunchy Taco',                 category: 'Tacos',      calories: 170, protein: 8,  carbs: 13, fat: 9 },
      { id: 'soft-taco-beef',       name: 'Soft Taco (Beef)',             category: 'Tacos',      calories: 180, protein: 9,  carbs: 17, fat: 9 },
      { id: 'crunchwrap-supreme',   name: 'Crunchwrap Supreme',           category: 'Specialties',calories: 530, protein: 16, carbs: 71, fat: 21, isPopular: true },
      { id: 'bean-burrito',         name: 'Bean Burrito',                 category: 'Burritos',   calories: 350, protein: 13, carbs: 54, fat: 9,  goalTags: ['plant-based'] },
    ],
  },

  {
    id: 'dunkin',
    name: "Dunkin'",
    shortName: "Dunkin'",
    aliases: ['dunkin donuts', 'dunkindonuts'],
    tier: 3,
    category: 'Coffee & Donuts',
    emoji: '🍩',
    blurb: 'Egg white wraps and black coffee are the lanes — donuts are donuts.',
    popularityRank: 22,
    officialUrl: 'https://www.dunkindonuts.com',
    nutritionSourceUrl: 'https://www.dunkindonuts.com/nutrition',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: 'egg-white-veggie',     name: 'Egg White Veggie Wake-Up Wrap',category: 'Breakfast', calories: 200, protein: 11, carbs: 16, fat: 10, isPopular: true, goalTags: ['low-cal', 'high-protein'] },
      { id: 'bec-english-muffin',   name: 'Bacon Egg & Cheese on English Muffin', category: 'Breakfast', calories: 470, protein: 22, carbs: 41, fat: 24 },
      { id: 'glazed-donut',         name: 'Glazed Donut',                 category: 'Donuts',    calories: 240, protein: 4,  carbs: 28, fat: 14, isPopular: true },
      { id: 'iced-coffee-black',    name: 'Iced Coffee (Medium, Black)',  category: 'Drinks',    calories: 5,   protein: 0,  carbs: 1,  fat: 0,  isPopular: true, goalTags: ['low-cal'] },
      { id: 'avocado-toast',        name: 'Avocado Toast',                category: 'Breakfast', calories: 250, protein: 7,  carbs: 33, fat: 10, goalTags: ['plant-based'] },
      { id: 'hash-browns',          name: 'Hash Browns (Regular)',        category: 'Sides',     calories: 130, protein: 1,  carbs: 14, fat: 7 },
    ],
  },

  {
    id: 'shake-shack',
    name: 'Shake Shack',
    shortName: 'Shake Shack',
    aliases: ['shakeshack'],
    tier: 3,
    category: 'Burgers',
    emoji: '🥩',
    blurb: 'Higher-quality beef and cleaner ingredients — still a burger-and-fries situation.',
    popularityRank: 23,
    officialUrl: 'https://www.shakeshack.com',
    nutritionSourceUrl: 'https://www.shakeshack.com/nutrition',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: 'hamburger-single',     name: 'Hamburger (Single, Plain)',    category: 'Burgers',  calories: 410, protein: 24, carbs: 22, fat: 24, isPopular: true },
      { id: 'shackburger-single',   name: 'ShackBurger (Single)',         category: 'Burgers',  calories: 530, protein: 26, carbs: 23, fat: 36, isPopular: true },
      { id: 'cheeseburger-single',  name: 'Cheeseburger (Single)',        category: 'Burgers',  calories: 480, protein: 25, carbs: 23, fat: 30 },
      { id: 'chickn-shack',         name: "Chick'n Shack",                category: 'Sandwiches',calories: 600, protein: 30, carbs: 49, fat: 31, isPopular: true, goalTags: ['high-protein'] },
      { id: 'crinkle-fries',        name: 'Crinkle Cut Fries',            category: 'Sides',    calories: 470, protein: 5,  carbs: 56, fat: 25 },
      { id: 'cheese-fries',         name: 'Cheese Fries',                 category: 'Sides',    calories: 750, protein: 13, carbs: 65, fat: 47 },
    ],
  },

  {
    id: 'jimmy-johns',
    name: "Jimmy John's",
    shortName: "Jimmy John's",
    aliases: ['jimmy johns', 'jimmyjohns'],
    tier: 3,
    category: 'Subs',
    emoji: '🥖',
    blurb: 'Most subs run high — "Unwich" (lettuce wrap) is the macro-friendly version.',
    popularityRank: 24,
    officialUrl: 'https://www.jimmyjohns.com',
    nutritionSourceUrl: 'https://www.jimmyjohns.com/nutrition',
    nutritionNote: '"Unwich" replaces bread with a giant lettuce wrap — drops carbs dramatically.',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: 'turkey-tom-unwich',    name: 'Turkey Tom Unwich',            category: 'Unwich',     calories: 290, protein: 19, carbs: 6,  fat: 22, isPopular: true, goalTags: ['high-protein', 'low-carb'] },
      { id: 'vito-unwich',          name: 'Vito Unwich',                  category: 'Unwich',     calories: 290, protein: 16, carbs: 5,  fat: 23, goalTags: ['low-carb'] },
      { id: 'turkey-tom-4',         name: '#4 Turkey Tom (Reg Sub)',      category: 'Subs',       calories: 530, protein: 21, carbs: 53, fat: 25, isPopular: true },
      { id: 'italian-night-club-9', name: '#9 Italian Night Club (Reg)',  category: 'Subs',       calories: 1000,protein: 41, carbs: 56, fat: 64 },
      { id: 'beach-club-12',        name: '#12 Beach Club (Reg)',         category: 'Subs',       calories: 1110,protein: 53, carbs: 56, fat: 70 },
    ],
  },

  {
    id: 'dominos',
    name: "Domino's",
    shortName: "Domino's",
    aliases: ['dominos', 'dominos pizza'],
    tier: 3,
    category: 'Pizza',
    emoji: '🍕',
    blurb: 'Thin crust + light cheese is the survivable build. Per-slice values shown below.',
    popularityRank: 25,
    officialUrl: 'https://www.dominos.com',
    nutritionSourceUrl: 'https://www.dominos.com/nutrition',
    nutritionNote: 'All slices are 1/8 of a medium pizza unless otherwise stated.',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: 'thin-cheese-slice',    name: 'Thin Crust Cheese (1 Slice)',    category: 'Pizza', calories: 140, protein: 6,  carbs: 14, fat: 6,  isPopular: true, goalTags: ['low-cal'] },
      { id: 'thin-veggie-slice',    name: 'Thin Crust Veggie (1 Slice)',    category: 'Pizza', calories: 160, protein: 7,  carbs: 17, fat: 7 },
      { id: 'hand-cheese-slice',    name: 'Hand-Tossed Cheese (1 Slice)',   category: 'Pizza', calories: 200, protein: 9,  carbs: 25, fat: 7,  isPopular: true },
      { id: 'hand-pepp-slice',      name: 'Hand-Tossed Pepperoni (1 Slice)',category: 'Pizza', calories: 220, protein: 10, carbs: 25, fat: 9,  isPopular: true },
      { id: 'cinna-stix-2',         name: 'Cinna Stix (2 pieces)',          category: 'Sides', calories: 90,  protein: 1,  carbs: 13, fat: 4 },
    ],
  },

  {
    id: 'pizza-hut',
    name: 'Pizza Hut',
    shortName: 'Pizza Hut',
    aliases: ['pizzahut'],
    tier: 3,
    category: 'Pizza',
    emoji: '🍕',
    blurb: "Thin 'N Crispy is the leanest option — pan crust is the cal bomb.",
    popularityRank: 26,
    officialUrl: 'https://www.pizzahut.com',
    nutritionSourceUrl: 'https://www.pizzahut.com/nutrition',
    nutritionNote: 'All slices are 1/8 of a medium pizza.',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: 'thin-cheese-slice',    name: "Thin 'N Crispy Cheese (1 Slice)", category: 'Pizza', calories: 190, protein: 9,  carbs: 20, fat: 8,  isPopular: true, goalTags: ['low-cal'] },
      { id: 'thin-veggie-slice',    name: "Thin 'N Crispy Veggie (1 Slice)", category: 'Pizza', calories: 220, protein: 10, carbs: 22, fat: 10 },
      { id: 'hand-cheese-slice',    name: 'Hand-Tossed Cheese (1 Slice)',    category: 'Pizza', calories: 240, protein: 11, carbs: 30, fat: 8,  isPopular: true },
      { id: 'pan-pepp-slice',       name: 'Pan Pepperoni (1 Slice)',         category: 'Pizza', calories: 290, protein: 12, carbs: 28, fat: 14 },
      { id: 'breadstick',           name: 'Breadstick (1)',                  category: 'Sides', calories: 140, protein: 5,  carbs: 19, fat: 4 },
    ],
  },

  {
    id: 'papa-johns',
    name: "Papa John's",
    shortName: "Papa John's",
    aliases: ['papajohns', 'papa johns'],
    tier: 3,
    category: 'Pizza',
    emoji: '🍕',
    blurb: 'Thin crust + a single garden veggie topping is the survivable build.',
    popularityRank: 27,
    officialUrl: 'https://www.papajohns.com',
    nutritionSourceUrl: 'https://www.papajohns.com/nutrition',
    nutritionNote: 'All slices are 1/8 of a large pizza.',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: 'thin-pepp-slice',      name: 'Thin Crust Pepperoni (1 Slice)',  category: 'Pizza', calories: 230, protein: 10, carbs: 19, fat: 12, goalTags: ['low-cal'] },
      { id: 'orig-cheese-slice',    name: 'Original Crust Cheese (1 Slice)', category: 'Pizza', calories: 250, protein: 11, carbs: 30, fat: 9,  isPopular: true },
      { id: 'orig-pepp-slice',      name: 'Original Crust Pepperoni (1 Slice)', category: 'Pizza', calories: 290, protein: 12, carbs: 30, fat: 13, isPopular: true },
      { id: 'garden-veggie-slice',  name: 'Garden Fresh Veggie (Orig, 1 Slice)', category: 'Pizza', calories: 230, protein: 9,  carbs: 29, fat: 9,  goalTags: ['plant-based'] },
      { id: 'garlic-knots-2',       name: 'Garlic Knots (2)',                category: 'Sides', calories: 220, protein: 5,  carbs: 27, fat: 10 },
    ],
  },

  {
    id: 'del-taco',
    name: 'Del Taco',
    shortName: 'Del Taco',
    aliases: ['deltaco'],
    tier: 3,
    category: 'Fast Food',
    emoji: '🌯',
    blurb: 'Flex menu (grilled chicken avocado tacos) is the win — Epic burritos are calorie bombs.',
    popularityRank: 28,
    officialUrl: 'https://www.deltaco.com',
    nutritionSourceUrl: 'https://www.deltaco.com/nutrition',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: 'grilled-chx-avo-taco', name: 'Grilled Chicken Avocado Taco', category: 'Tacos',    calories: 200, protein: 12, carbs: 14, fat: 11, isPopular: true, goalTags: ['low-cal', 'high-protein'] },
      { id: 'del-taco',             name: 'The Del Taco',                 category: 'Tacos',    calories: 210, protein: 7,  carbs: 16, fat: 12, isPopular: true },
      { id: 'crunchtada-tostada',   name: 'Crunchtada Tostada',           category: 'Tacos',    calories: 230, protein: 7,  carbs: 20, fat: 13 },
      { id: 'beans-cheese-burrito', name: 'Beans & Cheese Burrito',       category: 'Burritos', calories: 480, protein: 15, carbs: 65, fat: 17, goalTags: ['plant-based'] },
      { id: 'epic-beyond-burrito',  name: 'Epic Beyond Mex Burrito',      category: 'Burritos', calories: 800, protein: 26, carbs: 76, fat: 43, goalTags: ['plant-based'] },
    ],
  },

  {
    id: 'culvers',
    name: "Culver's",
    shortName: "Culver's",
    aliases: ['culvers'],
    tier: 3,
    category: 'Fast Food',
    emoji: '🐄',
    blurb: 'Fresh beef ButterBurgers and frozen custard — grilled chicken sandwich is the lean pick.',
    popularityRank: 29,
    officialUrl: 'https://www.culvers.com',
    nutritionSourceUrl: 'https://www.culvers.com/menu/nutrition',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: 'grilled-chx-sand',     name: 'Grilled Chicken Sandwich',     category: 'Sandwiches', calories: 410, protein: 31, carbs: 39, fat: 14, isPopular: true, goalTags: ['high-protein'] },
      { id: 'butterburger-cheese',  name: 'ButterBurger Cheese (Single)', category: 'Burgers',    calories: 580, protein: 25, carbs: 36, fat: 35, isPopular: true },
      { id: 'cheese-curds-reg',     name: 'Wisconsin Cheese Curds (Reg)', category: 'Sides',      calories: 600, protein: 23, carbs: 32, fat: 41 },
      { id: 'crinkle-fries-reg',    name: 'Crinkle Cut Fries (Reg)',      category: 'Sides',      calories: 360, protein: 4,  carbs: 50, fat: 16 },
      { id: 'concrete-mixer-m',     name: 'Concrete Mixer (M, Vanilla)',  category: 'Frozen Custard', calories: 720, protein: 16, carbs: 86, fat: 35, isPopular: true },
    ],
  },

  // ==========================================================================
  //  TIER 4 — Heavy
  // ==========================================================================
  {
    id: 'burger-king',
    name: 'Burger King',
    shortName: 'Burger King',
    aliases: ['burgerking', 'bk'],
    tier: 4,
    category: 'Fast Food',
    emoji: '👑',
    blurb: 'Whopper culture — most items run heavy on sodium and saturated fat.',
    popularityRank: 30,
    officialUrl: 'https://www.bk.com',
    nutritionSourceUrl: 'https://www.bk.com/nutrition',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: 'whopper',              name: 'Whopper',                      category: 'Burgers',    calories: 660, protein: 28, carbs: 49, fat: 40, isPopular: true },
      { id: 'whopper-jr',           name: 'Whopper Jr.',                  category: 'Burgers',    calories: 310, protein: 13, carbs: 27, fat: 17 },
      { id: 'chicken-royale',       name: 'Chicken Royale',               category: 'Sandwiches', calories: 480, protein: 27, carbs: 49, fat: 19, goalTags: ['high-protein'] },
      { id: 'bacon-king',           name: 'Bacon King',                   category: 'Burgers',    calories: 1150,protein: 61, carbs: 49, fat: 78 },
      { id: 'impossible-whopper',   name: 'Impossible Whopper',           category: 'Burgers',    calories: 630, protein: 25, carbs: 58, fat: 34, goalTags: ['plant-based'] },
    ],
  },

  {
    id: 'five-guys',
    name: 'Five Guys',
    shortName: 'Five Guys',
    aliases: ['fiveguys'],
    tier: 4,
    category: 'Burgers',
    emoji: '🍔',
    blurb: 'No shortcuts — single patty + no cheese is the lightest option, and it\'s still 700 cal.',
    popularityRank: 31,
    officialUrl: 'https://www.fiveguys.com',
    nutritionSourceUrl: 'https://www.fiveguys.com/-/media/public-site/files/nutritional.ashx',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: 'little-cheeseburger',  name: 'Little Cheeseburger (Single Patty)', category: 'Burgers', calories: 550, protein: 30, carbs: 39, fat: 32 },
      { id: 'hamburger-no-cheese',  name: 'Hamburger (No Cheese)',        category: 'Burgers', calories: 700, protein: 39, carbs: 39, fat: 43 },
      { id: 'cheeseburger',         name: 'Cheeseburger',                 category: 'Burgers', calories: 980, protein: 47, carbs: 40, fat: 64, isPopular: true },
      { id: 'bacon-cheeseburger',   name: 'Bacon Cheeseburger',           category: 'Burgers', calories: 1080,protein: 56, carbs: 40, fat: 75, isPopular: true },
      { id: 'cajun-fries-reg',      name: 'Cajun Fries (Regular)',        category: 'Sides',   calories: 950, protein: 15, carbs: 130,fat: 41 },
      { id: 'hot-dog',              name: 'Hot Dog',                      category: 'Mains',   calories: 540, protein: 21, carbs: 40, fat: 35 },
    ],
  },

  {
    id: 'popeyes',
    name: 'Popeyes',
    shortName: 'Popeyes',
    tier: 4,
    category: 'Fast Food',
    emoji: '🍗',
    blurb: 'Deep-fried everything. Bonafide chicken breast is the protein-dense pick if you must.',
    popularityRank: 32,
    officialUrl: 'https://www.popeyes.com',
    nutritionSourceUrl: 'https://www.popeyes.com/nutrition',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: 'spicy-chicken-sand',   name: 'Spicy Chicken Sandwich',       category: 'Sandwiches', calories: 700, protein: 28, carbs: 50, fat: 42, isPopular: true },
      { id: 'classic-chicken-sand', name: 'Classic Chicken Sandwich',     category: 'Sandwiches', calories: 690, protein: 28, carbs: 50, fat: 42 },
      { id: 'bonafide-breast',      name: 'Bonafide Chicken Breast',      category: 'Chicken',    calories: 380, protein: 32, carbs: 16, fat: 20, isPopular: true, goalTags: ['high-protein'] },
      { id: 'mild-tender-1',        name: 'Mild Tender (1 piece)',        category: 'Chicken',    calories: 100, protein: 9,  carbs: 5,  fat: 5 },
      { id: 'red-beans-rice-reg',   name: 'Red Beans & Rice (Reg)',       category: 'Sides',      calories: 230, protein: 8,  carbs: 31, fat: 8 },
      { id: 'cajun-fries-reg',      name: 'Cajun Fries (Reg)',            category: 'Sides',      calories: 240, protein: 4,  carbs: 33, fat: 10 },
    ],
  },

  {
    id: 'sonic',
    name: 'Sonic Drive-In',
    shortName: 'Sonic',
    aliases: ['sonic drive in', 'sonicdrivein'],
    tier: 4,
    category: 'Fast Food',
    emoji: '🚗',
    blurb: 'Sugary drinks and indulgent burgers — very few macro-friendly lanes.',
    popularityRank: 33,
    officialUrl: 'https://www.sonicdrivein.com',
    nutritionSourceUrl: 'https://www.sonicdrivein.com/nutrition',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: 'sonic-cheeseburger',   name: 'Sonic Cheeseburger',           category: 'Burgers', calories: 670, protein: 28, carbs: 56, fat: 39, isPopular: true },
      { id: 'super-bacon-cheese',   name: 'SuperSONIC Bacon Cheeseburger',category: 'Burgers', calories: 950, protein: 40, carbs: 60, fat: 60 },
      { id: 'jr-bacon-cheese',      name: 'Jr. Bacon Cheeseburger',       category: 'Burgers', calories: 410, protein: 17, carbs: 33, fat: 24 },
      { id: 'tots-medium',          name: 'Tots (Medium)',                category: 'Sides',   calories: 270, protein: 3,  carbs: 33, fat: 14, isPopular: true },
      { id: 'cherry-limeade-med',   name: 'Cherry Limeade (Medium)',      category: 'Drinks',  calories: 220, protein: 0,  carbs: 60, fat: 0,  isPopular: true },
      { id: 'strawberry-shake-med', name: 'Strawberry Shake (Medium)',    category: 'Drinks',  calories: 670, protein: 13, carbs: 100,fat: 25 },
    ],
  },

  {
    id: 'jack-in-the-box',
    name: 'Jack in the Box',
    shortName: 'Jack in the Box',
    aliases: ['jackinthebox', 'jitb'],
    tier: 4,
    category: 'Fast Food',
    emoji: '🃏',
    blurb: 'Highly processed across the board — few standout lighter options.',
    popularityRank: 34,
    officialUrl: 'https://www.jackinthebox.com',
    nutritionSourceUrl: 'https://www.jackinthebox.com/nutrition',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: 'jumbo-jack',           name: 'Jumbo Jack',                   category: 'Burgers',    calories: 590, protein: 22, carbs: 51, fat: 32, isPopular: true },
      { id: 'sourdough-jack',       name: 'Sourdough Jack',               category: 'Burgers',    calories: 700, protein: 26, carbs: 36, fat: 50 },
      { id: 'spicy-chicken-sand',   name: 'Spicy Chicken Sandwich',       category: 'Sandwiches', calories: 600, protein: 22, carbs: 70, fat: 26 },
      { id: 'curly-fries-medium',   name: 'Curly Fries (Medium)',         category: 'Sides',      calories: 400, protein: 4,  carbs: 48, fat: 21, isPopular: true },
      { id: 'bacon-ultimate-cheese',name: 'Bacon Ultimate Cheeseburger',  category: 'Burgers',    calories: 1010,protein: 41, carbs: 53, fat: 71 },
      { id: 'egg-roll-1',           name: 'Egg Roll (1)',                 category: 'Sides',      calories: 130, protein: 4,  carbs: 15, fat: 7 },
    ],
  },

  {
    id: 'arbys',
    name: "Arby's",
    shortName: "Arby's",
    aliases: ['arbys'],
    tier: 4,
    category: 'Fast Food',
    emoji: '🥪',
    blurb: 'Roast beef base is decent for protein — most sauces and combo sides drag macros down.',
    popularityRank: 35,
    officialUrl: 'https://www.arbys.com',
    nutritionSourceUrl: 'https://www.arbys.com/nutrition',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: 'classic-roast-beef',   name: 'Classic Roast Beef',           category: 'Sandwiches', calories: 360, protein: 23, carbs: 37, fat: 13, isPopular: true, goalTags: ['high-protein'] },
      { id: 'beef-n-cheddar',       name: "Beef 'n Cheddar",              category: 'Sandwiches', calories: 450, protein: 23, carbs: 45, fat: 20, isPopular: true },
      { id: 'smokehouse-brisket',   name: 'Smokehouse Brisket',           category: 'Sandwiches', calories: 600, protein: 31, carbs: 47, fat: 31 },
      { id: 'crispy-chicken-sand',  name: 'Crispy Chicken Sandwich',      category: 'Sandwiches', calories: 520, protein: 26, carbs: 52, fat: 23 },
      { id: 'roast-turkey-swiss',   name: 'Roast Turkey & Swiss',         category: 'Sandwiches', calories: 760, protein: 41, carbs: 79, fat: 30, goalTags: ['high-protein'] },
      { id: 'curly-fries-medium',   name: 'Curly Fries (Medium)',         category: 'Sides',      calories: 540, protein: 6,  carbs: 65, fat: 28 },
    ],
  },

  {
    id: 'long-john-silvers',
    name: "Long John Silver's",
    shortName: "Long John Silver's",
    aliases: ['long john silvers', 'ljs'],
    tier: 4,
    category: 'Seafood',
    emoji: '🐟',
    blurb: 'Battered and fried fish — among the heaviest macros in fast food. Limited light options.',
    popularityRank: 36,
    officialUrl: 'https://www.ljsilvers.com',
    nutritionSourceUrl: 'https://www.ljsilvers.com/nutrition',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: 'fish-2pc',             name: 'Fish (2 pieces)',              category: 'Mains', calories: 460, protein: 26, carbs: 36, fat: 26, isPopular: true },
      { id: 'chicken-plank-1',      name: 'Chicken Plank (1)',            category: 'Mains', calories: 130, protein: 7,  carbs: 9,  fat: 7 },
      { id: 'shrimp-1',             name: 'Shrimp (1 piece)',             category: 'Mains', calories: 30,  protein: 1,  carbs: 3,  fat: 2 },
      { id: 'hushpuppy-1',          name: 'Hushpuppy (1)',                category: 'Sides', calories: 60,  protein: 1,  carbs: 9,  fat: 3 },
      { id: 'cole-slaw',            name: 'Cole Slaw',                    category: 'Sides', calories: 200, protein: 1,  carbs: 15, fat: 15 },
    ],
  },

  {
    id: 'ihop',
    name: 'IHOP',
    shortName: 'IHOP',
    aliases: ['international house of pancakes'],
    tier: 4,
    category: 'Breakfast',
    emoji: '🥞',
    blurb: 'Massive portions and syrup-heavy plates — egg-white omelets are the macro-friendly pick.',
    popularityRank: 37,
    officialUrl: 'https://www.ihop.com',
    nutritionSourceUrl: 'https://www.ihop.com/nutrition',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: 'spinach-mushroom-omelette', name: 'Spinach & Mushroom Omelette', category: 'Omelettes',  calories: 480, protein: 32, carbs: 13, fat: 33, isPopular: true, goalTags: ['high-protein', 'low-carb'] },
      { id: 'buttermilk-pancakes-5',     name: 'Original Buttermilk Pancakes (5)', category: 'Pancakes', calories: 600, protein: 16, carbs: 99, fat: 14, isPopular: true },
      { id: '2x2x2',                     name: '2 × 2 × 2 Combo',               category: 'Combos',     calories: 740, protein: 26, carbs: 65, fat: 41, isPopular: true },
      { id: 'big-steak-omelette',        name: 'Big Steak Omelette',            category: 'Omelettes',  calories: 1010,protein: 50, carbs: 27, fat: 79 },
      { id: 'stuffed-french-toast',      name: 'Stuffed French Toast',          category: 'Breakfast',  calories: 770, protein: 16, carbs: 110,fat: 28 },
    ],
  },

  // ==========================================================================
  //  TIER 5 — Nutritional Landmines
  // ==========================================================================
  {
    id: 'whataburger',
    name: 'Whataburger',
    shortName: 'Whataburger',
    tier: 5,
    category: 'Fast Food',
    emoji: '🟧',
    blurb: 'Beloved in Texas, brutal on macros — nearly everything runs heavy.',
    popularityRank: 38,
    officialUrl: 'https://whataburger.com',
    nutritionSourceUrl: 'https://whataburger.com/menu/nutrition',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: 'whataburger-5',        name: 'Whataburger (5")',             category: 'Burgers',    calories: 590, protein: 27, carbs: 56, fat: 26, isPopular: true },
      { id: 'whataburger-jr',       name: 'Whataburger Jr.',              category: 'Burgers',    calories: 320, protein: 14, carbs: 33, fat: 14 },
      { id: 'whatachickn-sand',     name: "Whatachick'n Sandwich",        category: 'Sandwiches', calories: 660, protein: 31, carbs: 60, fat: 33, isPopular: true },
      { id: 'bacon-cheese-whata',   name: 'Bacon & Cheese Whataburger',   category: 'Burgers',    calories: 800, protein: 39, carbs: 56, fat: 44 },
      { id: 'french-fries-medium',  name: 'French Fries (Medium)',        category: 'Sides',      calories: 410, protein: 6,  carbs: 53, fat: 18 },
    ],
  },

  {
    id: 'carls-jr',
    name: "Carl's Jr. / Hardee's",
    shortName: "Carl's Jr.",
    aliases: ['carls jr', 'hardees', "hardee's"],
    tier: 5,
    category: 'Fast Food',
    emoji: '⭐',
    blurb: '1000+ calorie burgers are the norm — Charbroiled BBQ Chicken is a rare lean option.',
    popularityRank: 39,
    officialUrl: 'https://www.carlsjr.com',
    nutritionSourceUrl: 'https://www.carlsjr.com/nutrition',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: 'charbroiled-bbq-chx',  name: 'Charbroiled BBQ Chicken Sandwich', category: 'Sandwiches', calories: 380, protein: 35, carbs: 49, fat: 5,  isPopular: true, goalTags: ['high-protein'] },
      { id: 'famous-star-cheese',   name: 'Famous Star w/ Cheese',        category: 'Burgers',    calories: 670, protein: 23, carbs: 47, fat: 41, isPopular: true },
      { id: 'super-star-cheese',    name: 'Super Star w/ Cheese',         category: 'Burgers',    calories: 920, protein: 40, carbs: 49, fat: 60 },
      { id: 'western-bacon',        name: 'Western Bacon Cheeseburger',   category: 'Burgers',    calories: 740, protein: 31, carbs: 70, fat: 33, isPopular: true },
      { id: 'crisscut-fries-medium',name: 'Crisscut Fries (Medium)',      category: 'Sides',      calories: 410, protein: 5,  carbs: 56, fat: 18 },
    ],
  },

  {
    id: 'daves-hot-chicken',
    name: "Dave's Hot Chicken",
    shortName: "Dave's Hot Chicken",
    aliases: ['daves hot chicken'],
    tier: 5,
    category: 'Fast Food',
    emoji: '🌶️',
    blurb: 'Extremely high calorie + sodium — tender-only orders are the lighter cut.',
    popularityRank: 40,
    officialUrl: 'https://www.daveshotchicken.com',
    nutritionSourceUrl: 'https://www.daveshotchicken.com/nutrition',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: '4pc-tenders',          name: '4-Piece Tenders (No Sides)',   category: 'Tenders', calories: 720, protein: 65, carbs: 51, fat: 27, isPopular: true, goalTags: ['high-protein'] },
      { id: '2-tender-slider',      name: '2-Tender Slider (1 slider)',   category: 'Sliders', calories: 350, protein: 16, carbs: 26, fat: 21 },
      { id: 'hot-chicken-sand',     name: 'Hot Chicken Sandwich',         category: 'Sandwiches', calories: 740, protein: 32, carbs: 51, fat: 45, isPopular: true },
      { id: '2-tender-combo',       name: '2-Tender Combo (w/ Fries + Slaw)', category: 'Combos', calories: 1330,protein: 52, carbs: 116,fat: 70 },
      { id: 'kale-slaw',            name: 'Kale Slaw',                    category: 'Sides',   calories: 330, protein: 4,  carbs: 28, fat: 23 },
    ],
  },

  {
    id: 'waffle-house',
    name: 'Waffle House',
    shortName: 'Waffle House',
    aliases: ['wafflehouse'],
    tier: 5,
    category: 'Breakfast',
    emoji: '🧇',
    blurb: 'Butter-heavy diner classics — no real healthy lane on the menu.',
    popularityRank: 41,
    officialUrl: 'https://www.wafflehouse.com',
    nutritionSourceUrl: 'https://www.wafflehouse.com/nutrition',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: 'all-star-special',     name: 'All-Star Special',             category: 'Combos',    calories: 940, protein: 32, carbs: 95, fat: 49, isPopular: true },
      { id: 'waffle-regular',       name: 'Waffle (Regular)',             category: 'Breakfast', calories: 410, protein: 7,  carbs: 41, fat: 24, isPopular: true },
      { id: '2-eggs-bacon-toast',   name: '2 Eggs, Bacon, Toast',         category: 'Breakfast', calories: 600, protein: 28, carbs: 35, fat: 38 },
      { id: 'hash-browns-regular',  name: 'Hash Browns (Regular)',        category: 'Sides',     calories: 320, protein: 4,  carbs: 30, fat: 21 },
      { id: 'texas-bacon-melt',     name: "Texas Bacon Lover's Melt",     category: 'Mains',     calories: 1010,protein: 39, carbs: 68, fat: 65 },
    ],
  },

  {
    id: 'krispy-kreme',
    name: 'Krispy Kreme',
    shortName: 'Krispy Kreme',
    aliases: ['krispykreme'],
    tier: 5,
    category: 'Donuts',
    emoji: '🍩',
    blurb: 'Pure sugar and fat — there is no healthy version. Track honestly when you indulge.',
    popularityRank: 42,
    officialUrl: 'https://www.krispykreme.com',
    nutritionSourceUrl: 'https://www.krispykreme.com/nutrition',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: 'original-glazed',      name: 'Original Glazed Donut',        category: 'Donuts', calories: 190, protein: 3, carbs: 22, fat: 11, isPopular: true },
      { id: 'choc-iced-glazed',     name: 'Chocolate Iced Glazed',        category: 'Donuts', calories: 240, protein: 3, carbs: 33, fat: 12, isPopular: true },
      { id: 'choc-custard-filled',  name: 'Chocolate Iced Custard Filled',category: 'Donuts', calories: 300, protein: 3, carbs: 36, fat: 16 },
      { id: 'glazed-cake',          name: 'Glazed Cake Donut',            category: 'Donuts', calories: 280, protein: 3, carbs: 33, fat: 16 },
      { id: 'strawberry-iced',      name: 'Strawberry Iced Glazed',       category: 'Donuts', calories: 240, protein: 3, carbs: 32, fat: 12 },
    ],
  },

  {
    id: 'dairy-queen',
    name: 'Dairy Queen',
    shortName: 'Dairy Queen',
    aliases: ['dairyqueen', 'dq'],
    tier: 5,
    category: 'Fast Food / Desserts',
    emoji: '🍦',
    blurb: 'Dessert-first menu — Blizzards and shakes are the headliners. Limited real food options.',
    popularityRank: 43,
    officialUrl: 'https://www.dairyqueen.com',
    nutritionSourceUrl: 'https://www.dairyqueen.com/nutrition',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: 'oreo-blizzard-medium', name: 'Medium Oreo Blizzard',         category: 'Desserts', calories: 740, protein: 14, carbs: 102,fat: 30, isPopular: true },
      { id: 'choc-shake-medium',    name: 'Medium Chocolate Shake',       category: 'Desserts', calories: 720, protein: 16, carbs: 119,fat: 22 },
      { id: 'vanilla-cone-small',   name: 'Vanilla Cone (Small)',         category: 'Desserts', calories: 230, protein: 5,  carbs: 37, fat: 7 },
      { id: 'grillburger-cheese',   name: '1/4 lb GrillBurger w/ Cheese', category: 'Burgers',  calories: 540, protein: 30, carbs: 40, fat: 28, isPopular: true },
      { id: 'chicken-strip-4',      name: 'Chicken Strip Basket (4pc + Fries)', category: 'Mains', calories: 1050,protein: 33, carbs: 92, fat: 56 },
      { id: 'chili-cheese-dog',     name: 'Chili Cheese Dog',             category: 'Mains',    calories: 350, protein: 14, carbs: 27, fat: 21 },
    ],
  },

  {
    id: 'checkers',
    name: "Checkers / Rally's",
    shortName: "Checkers",
    aliases: ['rallys', "rally's", 'checkers rallys'],
    tier: 5,
    category: 'Fast Food',
    emoji: '🏁',
    blurb: 'Some of the most processed food in fast food — Famous Seasoned Fries are the hook.',
    popularityRank: 44,
    officialUrl: 'https://www.checkers.com',
    nutritionSourceUrl: 'https://www.checkers.com/nutrition',
    lastVerified: '2026-05-17',
    menuItems: [
      { id: 'classic-burger',       name: 'Classic Burger',               category: 'Burgers',    calories: 380, protein: 18, carbs: 35, fat: 19, isPopular: true },
      { id: 'big-buford',           name: 'Big Buford',                   category: 'Burgers',    calories: 800, protein: 41, carbs: 50, fat: 47, isPopular: true },
      { id: 'spicy-chicken-sand',   name: 'Spicy Chicken Sandwich',       category: 'Sandwiches', calories: 470, protein: 18, carbs: 46, fat: 23 },
      { id: 'seasoned-fries-medium',name: 'Famous Seasoned Fries (Medium)', category: 'Sides',    calories: 530, protein: 7,  carbs: 64, fat: 27, isPopular: true },
      { id: 'chili-cheese-fries',   name: 'Chili Cheese Fries',           category: 'Sides',      calories: 750, protein: 19, carbs: 70, fat: 47 },
    ],
  },
];

// ============================================================================
//  Helpers
// ============================================================================

/** Find restaurants whose shortName or aliases appear in arbitrary user text. */
export const detectRestaurantsInText = (text: string): Restaurant[] => {
  if (!text) return [];
  const lower = text.toLowerCase();
  const hits = new Set<string>();
  for (const r of RESTAURANTS) {
    if (lower.includes(r.shortName.toLowerCase())) hits.add(r.id);
    else if (r.aliases?.some(a => lower.includes(a.toLowerCase()))) hits.add(r.id);
  }
  return RESTAURANTS.filter(r => hits.has(r.id));
};

/** Fuzzy search menu items across all restaurants. Returns ranked matches. */
export const searchMenuItems = (
  query: string,
  limit = 20,
): Array<{ restaurant: Restaurant; item: MenuItem; score: number }> => {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  const results: Array<{ restaurant: Restaurant; item: MenuItem; score: number }> = [];
  for (const r of RESTAURANTS) {
    for (const item of r.menuItems) {
      const name = item.name.toLowerCase();
      let score = 0;
      if (name === q) score = 100;
      else if (name.startsWith(q)) score = 80;
      else if (name.includes(q)) score = 60;
      else if (r.shortName.toLowerCase().includes(q)) score = 30;
      if (score > 0) results.push({ restaurant: r, item, score });
    }
  }
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
};

/** Sort restaurants by tier (1 first) then by popularity rank. */
export const sortedRestaurants = (): Restaurant[] =>
  [...RESTAURANTS].sort((a, b) => a.tier - b.tier || a.popularityRank - b.popularityRank);

/**
 * Return the effective menu for a restaurant — built-in items merged with any
 * user-added custom items. Used by Restaurant Hub display, macro-fit scoring,
 * and the AI context injection so custom items participate in everything.
 */
export const getEffectiveMenuItems = (
  restaurant: Restaurant,
  customItemsByRestaurant?: Record<string, MenuItem[]>,
): MenuItem[] => {
  const custom = customItemsByRestaurant?.[restaurant.id];
  if (!custom || custom.length === 0) return restaurant.menuItems;
  return [...restaurant.menuItems, ...custom];
};

// Common English filler words we strip when matching user text to menu items.
// Including stuff that varies a lot ("from", "the", "a", "with", quantity
// modifiers like "extra", and connectors) keeps the keyword overlap signal
// focused on actual food-identifying words.
const MENU_MATCH_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'on', 'at', 'in', 'to', 'for', 'with',
  'from', 'by', 'i', 'me', 'my', 'we', 'us', 'this', 'that', 'these', 'those',
  'is', 'was', 'are', 'were', 'be', 'been', 'has', 'have', 'had',
  // restaurant intent words — they tell us where, not what
  'restaurant', 'menu', 'item', 'order', 'ordered', 'got', 'had', 'ate',
  // size/qty modifiers — we want the food word, not the modifier
  'small', 'medium', 'large', 'regular', 'extra', 'double', 'triple', 'no',
  'less', 'more', 'light', 'side', 'side',
]);

/**
 * Fuzzy-match menu items against arbitrary user text by keyword overlap.
 * Returns items with a score >= 2 (either 2+ shared content tokens, or a
 * 2-word phrase match). Used by formatRestaurantContext to send the AI only
 * items relevant to the user's query — preventing it from "substituting"
 * close-but-different items (e.g. wrap returned for flatbread query).
 */
export const findMenuItemMatches = (userText: string, items: MenuItem[]): MenuItem[] => {
  if (!userText || items.length === 0) return [];
  const lower = userText.toLowerCase();
  const userTokens = new Set(
    lower
      .split(/[^a-z0-9]+/)
      .filter(t => t.length > 2 && !MENU_MATCH_STOPWORDS.has(t)),
  );
  if (userTokens.size === 0) return [];

  const scored = items.map(item => {
    const itemLower = item.name.toLowerCase();
    const itemTokens = itemLower
      .split(/[^a-z0-9]+/)
      .filter(t => t.length > 2 && !MENU_MATCH_STOPWORDS.has(t));

    // Direct phrase match (any consecutive 2+ words of the item appear in
    // the user's text) — strong signal the user named this exact item.
    let phraseBonus = 0;
    for (let i = 0; i < itemTokens.length - 1; i++) {
      const phrase = `${itemTokens[i]} ${itemTokens[i + 1]}`;
      if (lower.includes(phrase)) phraseBonus = 3;
    }

    // Token overlap — how many content words appear in both
    let overlap = 0;
    for (const t of itemTokens) {
      if (userTokens.has(t)) overlap++;
    }

    return { item, score: overlap + phraseBonus };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.filter(s => s.score >= 2).slice(0, 5).map(s => s.item);
};

// ============================================================================
//  Macro-fit suggestion engine
// ============================================================================
// Scores menu items against the user's remaining macros for the day. Used by
// the "What fits your day" card on the Restaurant Hub tab.
//
// Design goals:
//   • Calories should land in the 30–90% range of what's left (a full meal
//     uses meaningful budget, but doesn't blow it entirely).
//   • Reward protein contribution when the user still has protein to hit.
//   • Penalize items that exceed remaining calories (but don't outright hide
//     them — sometimes there's a small overage that's fine, and we want to
//     return SOMETHING even when the user is tight on budget).
//   • Bonus for items tagged high-protein / low-cal (goal-aware).
//   • Mild popularity bias so common picks surface over obscure ones.
//   • Diversity: cap to 2 items per restaurant in the final list so the user
//     doesn't see 8 Chipotle bowls in a row.

export interface MacroFitMatch {
  restaurant: Restaurant;
  item: MenuItem;
  score: number;
  /** Human-readable reason the item ranked well, for the UI subtitle. */
  reason: string;
}

export interface MacroFitOptions {
  /** How many results to return. Default 8. */
  limit?: number;
  /** Max items from a single restaurant. Default 2 (prevents Chipotle dominating). */
  maxPerRestaurant?: number;
  /** When the user wants high-protein options specifically. */
  proteinFocus?: boolean;
  /** User-added custom menu items, keyed by restaurant slug. Merged into the
   *  scoring pool so things the user has previously added show up in
   *  suggestions. */
  customMenuItems?: Record<string, MenuItem[]>;
}

export const findMacroFitMatches = (
  remainingCalories: number,
  remainingProtein: number,
  opts: MacroFitOptions = {},
): MacroFitMatch[] => {
  const limit = opts.limit ?? 8;
  const maxPerRestaurant = opts.maxPerRestaurant ?? 2;
  const proteinFocus = opts.proteinFocus ?? false;

  // If the user is already deep in the red (significantly over budget),
  // surface very low-cal options instead of trying to fit normally.
  const isOverBudget = remainingCalories <= 0;
  // Treat remaining as 200 kcal when over budget so we still rank low-cal items.
  const effectiveCalRemaining = isOverBudget ? 200 : remainingCalories;
  const effectiveProtRemaining = Math.max(remainingProtein, 1);

  const scored: MacroFitMatch[] = [];

  for (const restaurant of RESTAURANTS) {
    // Include user-added custom items in the scoring pool so personalized
    // additions surface in the macro-fit suggestions too.
    const itemsToScore = getEffectiveMenuItems(restaurant, opts.customMenuItems);
    for (const item of itemsToScore) {
      // ----- Calorie fit (peaked at ~50% of remaining) -----
      let calScore: number;
      if (item.calories <= effectiveCalRemaining) {
        // Fit ratio: how much of remaining this item uses. Peak at 0.5.
        const ratio = item.calories / effectiveCalRemaining;
        // Inverted distance from 0.5 → 1 = perfect fit, 0 = ratio is 0 or 1.
        calScore = 1 - Math.abs(ratio - 0.5) * 2;
      } else {
        // Item exceeds remaining — penalize proportional to overage.
        const overageRatio = (item.calories - effectiveCalRemaining) / effectiveCalRemaining;
        calScore = Math.max(-1, -overageRatio); // can go negative
      }

      // ----- Protein contribution -----
      // Items that get us closer to our protein target score higher, capped
      // at "fully closes the gap" so we don't reward overshooting wildly.
      const proteinContribution = Math.min(item.protein / effectiveProtRemaining, 1);
      // Weight: 0.7 when protein-focused, 0.4 otherwise.
      const proteinScore = proteinContribution * (proteinFocus ? 0.7 : 0.4);

      // ----- Goal-tag bonuses -----
      let goalBonus = 0;
      const tags = item.goalTags ?? [];
      if (tags.includes('high-protein')) goalBonus += proteinFocus ? 0.25 : 0.15;
      if (tags.includes('low-cal') && remainingCalories < 600) goalBonus += 0.15;
      if (tags.includes('low-carb') && proteinFocus) goalBonus += 0.05;

      // ----- Popularity nudge -----
      const popularityBonus = item.isPopular ? 0.1 : 0;

      // ----- Tier bias — slightly prefer Tier 1/2 restaurants -----
      const tierBonus = restaurant.tier === 1 ? 0.1
                      : restaurant.tier === 2 ? 0.05
                      : restaurant.tier === 3 ? 0 : -0.05;

      const total = calScore + proteinScore + goalBonus + popularityBonus + tierBonus;

      // Build a human reason for the UI ("47g protein, fits your budget").
      let reason = '';
      if (item.protein >= 30) reason = `${item.protein}g protein, hearty pick`;
      else if (tags.includes('low-cal')) reason = `light option · ${item.calories} cal`;
      else if (tags.includes('high-protein')) reason = `${item.protein}g protein`;
      else if (item.calories <= effectiveCalRemaining * 0.4) reason = `light snack · ${item.calories} cal`;
      else reason = `${item.protein}g protein · fits the day`;

      scored.push({ restaurant, item, score: total, reason });
    }
  }

  // Sort by score
  scored.sort((a, b) => b.score - a.score);

  // Diversify: cap to maxPerRestaurant per restaurant
  const perRestaurantCount = new Map<string, number>();
  const diversified: MacroFitMatch[] = [];
  for (const m of scored) {
    const used = perRestaurantCount.get(m.restaurant.id) ?? 0;
    if (used >= maxPerRestaurant) continue;
    perRestaurantCount.set(m.restaurant.id, used + 1);
    diversified.push(m);
    if (diversified.length >= limit) break;
  }

  return diversified;
};
