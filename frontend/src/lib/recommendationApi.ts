// ──────────────────────────────────────────────────────────
// costKu — Recommendation API Client
// Calls backend /api/v1/recommendations
// ──────────────────────────────────────────────────────────

import { apiFetch } from './apiClient';
import {
  KostTier,
  MealPlan,
  GroceryBasket,
  kostTiers as localKostTiers,
  mealPlans as localMealPlans,
  groceryBaskets as localGroceryBaskets,
  getKostTierForSalary,
} from '../data/recommendations';

export type { KostTier, MealPlan, GroceryBasket };

export interface RecommendationsResponse {
  salary: number;
  fixedExpenses: number;
  maxRentBudget: number;
  recommendedTier: KostTier;
  allKostTiers: KostTier[];
  mealPlans: MealPlan[];
  groceryBaskets: GroceryBasket[];
}

/**
 * Fetch lifestyle and housing recommendations from backend Express.
 */
export async function getRecommendations(): Promise<RecommendationsResponse> {
  try {
    return await apiFetch<RecommendationsResponse>('/api/v1/recommendations');
  } catch (err) {
    console.warn('[recommendationApi] Backend query failed, fallback to local:', err);
    const salary = 5500000;
    const fixedExpenses = 1200000;
    const maxRentBudget = Math.round(salary * 0.25);
    const recommendedTier = getKostTierForSalary(salary);
    return {
      salary,
      fixedExpenses,
      maxRentBudget,
      recommendedTier,
      allKostTiers: localKostTiers,
      mealPlans: localMealPlans,
      groceryBaskets: localGroceryBaskets,
    };
  }
}
