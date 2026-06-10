export type FoodItem = {
  name: string;
  quantity: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
};

export type NutritionTotal = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
};

export type NutritionResult = {
  status: string;
  food: FoodItem[];
  total: NutritionTotal;
};

export type Meal = {
  id: string;
  createdAt: string;
  imageUrl: string | null;
  nutrition: NutritionResult;
};

export type DailyTotal = {
  date: string;
  mealCount: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
};
