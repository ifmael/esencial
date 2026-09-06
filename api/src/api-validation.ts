// Zod schemas for every API mutation (spec: fail closed, 400 {error, field}).
import { z } from "zod";

// --- Recipes ---------------------------------------------------------------

export const ingredientSchema = z.object({
  food: z.string().min(1),
  quantity: z.number().positive().optional().nullable(),
  unit: z.string().optional().nullable(),
  section: z.string().optional().nullable(),
});

export const recipeSchema = z.object({
  name: z.string().min(1, "Recipe name is required"),
  description: z.string().optional().nullable(),
  servings: z.number().int().positive().optional().nullable(),
  photo_path: z
    .string()
    .transform((v) => v.trim() || null) // "" = sin foto, nunca persistir ""
    .optional()
    .nullable(),
  ingredients: z.array(ingredientSchema).optional().default([]),
  steps: z.array(z.string().min(1)).optional().default([]),
  materials: z.array(z.string().min(1)).optional().default([]),
  tags: z.array(z.string().min(1)).optional().default([]),
});
export type RecipeInput = z.infer<typeof recipeSchema>;

// --- Exercises -------------------------------------------------------------

export const exerciseSchema = z.object({
  name: z.string().min(1, "Exercise name is required"),
  description: z.string().optional().nullable(),
  setupCues: z.string().optional().nullable(),
  techniqueUrl: z.url("technique_url must be a valid URL").optional().nullable(),
  steps: z.array(z.string().min(1, "Each step must be non-empty")).max(40).optional().nullable(),
  tags: z.array(z.string().min(1)).min(1, "At least one tag is required"),
});
export type ExerciseInput = z.infer<typeof exerciseSchema>;

// --- Templates -------------------------------------------------------------

export const templateExerciseSchema = z.object({
  exerciseId: z.number().int().positive(),
  targetSets: z.number().int().positive().optional().nullable(),
  targetRepsMin: z.number().int().positive().optional().nullable(),
  targetRepsMax: z.number().int().positive().optional().nullable(),
});

export const templateSchema = z.object({
  name: z.string().min(1, "Template name is required"),
  // Absent on PUT means "preserve the stored value" (no default).
  rotationIndex: z.number().int().min(0).optional(),
  exercises: z.array(templateExerciseSchema).optional().default([]),
});
export type TemplateInput = z.infer<typeof templateSchema>;

// --- Meal plan -------------------------------------------------------------
export const MEALS = ["desayuno", "almuerzo", "cena"] as const;
export const ISO_WEEK = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/;

export const mealSlotSchema = z.object({
  day: z.number().int().min(0).max(6),
  meal: z.enum(MEALS),
  recipeId: z.number().int().positive().optional().nullable(),
});

export const mealPlanSchema = z.object({
  slots: z.array(mealSlotSchema),
});
export type MealPlanInput = z.infer<typeof mealPlanSchema>;

// --- Plan sessions + workout logs -------------------------------------------

export const planSessionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  templateId: z.number().int().positive(),
});

export const setLogSchema = z.object({
  templateExerciseId: z.number().int().positive(),
  setIndex: z.number().int().min(0),
  weightKg: z.number().min(0).optional().nullable(),
  reps: z.number().int().min(0).optional().nullable(),
  done: z.boolean().optional().default(false),
});

export const workoutLogSchema = z.object({
  effort: z.number().int().min(1).max(5, "effort must be 1-5"),
  note: z.string().optional().nullable(),
  sets: z.array(setLogSchema),
});
export type WorkoutLogInput = z.infer<typeof workoutLogSchema>;

// --- Day notes --------------------------------------------------------------

export const dayNoteSchema = z.object({
  text: z.string(),
});

// --- Shopping list (E3) -----------------------------------------------------

export const shoppingItemSchema = z.object({
  food: z.string().min(1),
  quantity: z.number().positive().optional().nullable(),
  unit: z.string().optional().nullable(),
  section: z.string().optional().nullable(),
  checked: z.boolean().optional().default(false),
});

export const shoppingItemsSchema = z.object({
  items: z.array(shoppingItemSchema),
});
export type ShoppingItemInput = z.infer<typeof shoppingItemSchema>;
// PATCH body: at least one updatable field (no defaults — an absent `checked`
// must not silently rewrite the stored flag). Unknown-only keys strip to {}
// and fail the refinement.
export const shoppingItemPatchSchema = z
  .object({
    food: z.string().min(1).optional(),
    quantity: z.number().positive().optional().nullable(),
    unit: z.string().optional().nullable(),
    section: z.string().optional().nullable(),
    checked: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "At least one of food, quantity, unit, section, checked is required",
  });
