export type StagingRow = {
  id: string;
  source: string;
  sourceRecipeId: string;
  title: string;
  status: "imported" | "ready" | "needs_review" | "promoted" | "rejected";
  cuisineTags: string[];
  mappingRate: number | null;
  unmappedIngredientNames: string[];
  mappedIngredientCount: number;
  imageUrl?: string;
  createdAt: string;
  estimatedTimeMin?: number | null;
  instructionsSummary?: string;
};

export const MOCK_ROWS: StagingRow[] = [
  {
    id: "01HY1A", source: "themealdb", sourceRecipeId: "52772", title: "Teriyaki Chicken Casserole",
    status: "ready", cuisineTags: ["Japanese"], mappingRate: 0.92,
    mappedIngredientCount: 11, unmappedIngredientNames: ["mirin"],
    imageUrl: "https://www.themealdb.com/images/media/meals/wvpsxx1468256321.jpg",
    createdAt: "2026-04-29T10:12:00Z", estimatedTimeMin: 45,
    instructionsSummary: "Whisk soy sauce, brown sugar, and ginger; bake chicken with the glaze; serve over rice with steamed broccoli.",
  },
  {
    id: "01HY1B", source: "themealdb", sourceRecipeId: "52854", title: "Beef and Mustard Pie",
    status: "needs_review", cuisineTags: ["British"], mappingRate: 0.55,
    mappedIngredientCount: 7, unmappedIngredientNames: ["beef stock", "english mustard", "puff pastry", "egg yolk"],
    imageUrl: "https://www.themealdb.com/images/media/meals/sytuqu1511553755.jpg",
    createdAt: "2026-04-29T09:30:00Z", estimatedTimeMin: 120,
  },
  {
    id: "01HY1C", source: "wikibooks", sourceRecipeId: "Agar_Jelly", title: "Agar Jelly",
    status: "imported", cuisineTags: ["Dessert"], mappingRate: 0.40,
    mappedIngredientCount: 2, unmappedIngredientNames: ["agar agar powder", "pandan leaves", "rock sugar"],
    createdAt: "2026-04-29T08:55:00Z", estimatedTimeMin: 25,
  },
  {
    id: "01HY1D", source: "themealdb", sourceRecipeId: "52905", title: "Tuna Nicoise",
    status: "ready", cuisineTags: ["French"], mappingRate: 1.0,
    mappedIngredientCount: 9, unmappedIngredientNames: [],
    imageUrl: "https://www.themealdb.com/images/media/meals/yqqqwu1511816912.jpg",
    createdAt: "2026-04-29T08:10:00Z", estimatedTimeMin: 30,
  },
  {
    id: "01HY1E", source: "wikibooks", sourceRecipeId: "African_Salad_II", title: "African Salad II (Abacha)",
    status: "needs_review", cuisineTags: ["African", "Nigerian"], mappingRate: 0.33,
    mappedIngredientCount: 4, unmappedIngredientNames: ["abacha", "ugba", "ehuru", "uziza", "akanwu", "stockfish", "ogiri", "utazi"],
    createdAt: "2026-04-28T22:40:00Z", estimatedTimeMin: 40,
  },
  {
    id: "01HY1F", source: "themealdb", sourceRecipeId: "53065", title: "Sushi",
    status: "needs_review", cuisineTags: ["Japanese"], mappingRate: 0.66,
    mappedIngredientCount: 6, unmappedIngredientNames: ["nori", "wasabi", "rice vinegar"],
    imageUrl: "https://www.themealdb.com/images/media/meals/g046bb1663960946.jpg",
    createdAt: "2026-04-28T18:20:00Z", estimatedTimeMin: 60,
  },
  {
    id: "01HY1G", source: "themealdb", sourceRecipeId: "52844", title: "Lasagne",
    status: "ready", cuisineTags: ["Italian"], mappingRate: 0.88,
    mappedIngredientCount: 14, unmappedIngredientNames: ["lasagne sheets", "parmigiano"],
    imageUrl: "https://www.themealdb.com/images/media/meals/wtsvxx1511296896.jpg",
    createdAt: "2026-04-28T16:00:00Z", estimatedTimeMin: 90,
  },
  {
    id: "01HY1H", source: "wikibooks", sourceRecipeId: "Banana_Bread", title: "Banana Bread",
    status: "imported", cuisineTags: ["Baking"], mappingRate: 0.83,
    mappedIngredientCount: 8, unmappedIngredientNames: ["baking soda"],
    createdAt: "2026-04-28T14:25:00Z", estimatedTimeMin: 75,
  },
  {
    id: "01HY1I", source: "themealdb", sourceRecipeId: "52819", title: "Recheado Masala Fish",
    status: "needs_review", cuisineTags: ["Indian", "Goan"], mappingRate: 0.45,
    mappedIngredientCount: 5, unmappedIngredientNames: ["kashmiri chillies", "tamarind paste", "kingfish", "feni"],
    imageUrl: "https://www.themealdb.com/images/media/meals/uwxqwy1483388311.jpg",
    createdAt: "2026-04-28T11:05:00Z", estimatedTimeMin: 50,
  },
  {
    id: "01HY1J", source: "themealdb", sourceRecipeId: "52961", title: "Budino Di Ricotta",
    status: "ready", cuisineTags: ["Italian", "Dessert"], mappingRate: 1.0,
    mappedIngredientCount: 7, unmappedIngredientNames: [],
    imageUrl: "https://www.themealdb.com/images/media/meals/1549542877.jpg",
    createdAt: "2026-04-28T09:50:00Z", estimatedTimeMin: 50,
  },
  {
    id: "01HY1K", source: "wikibooks", sourceRecipeId: "Tom_Yum", title: "Tom Yum Goong",
    status: "imported", cuisineTags: ["Thai"], mappingRate: 0.50,
    mappedIngredientCount: 5, unmappedIngredientNames: ["galangal", "kaffir lime leaves", "lemongrass", "thai bird chillies", "fish sauce"],
    createdAt: "2026-04-28T08:15:00Z", estimatedTimeMin: 35,
  },
  {
    id: "01HY1L", source: "themealdb", sourceRecipeId: "52941", title: "Mediterranean Pasta Salad",
    status: "promoted", cuisineTags: ["Mediterranean"], mappingRate: 1.0,
    mappedIngredientCount: 10, unmappedIngredientNames: [],
    imageUrl: "https://www.themealdb.com/images/media/meals/sxxpvx1511452260.jpg",
    createdAt: "2026-04-27T20:30:00Z", estimatedTimeMin: 25,
  },
];

export const FACETS = {
  statuses: [
    { status: "imported", count: 3 },
    { status: "ready", count: 4 },
    { status: "needs_review", count: 4 },
    { status: "promoted", count: 1 },
    { status: "rejected", count: 0 },
  ],
  sources: [
    { source: "themealdb", count: 7 },
    { source: "wikibooks", count: 5 },
  ],
};
