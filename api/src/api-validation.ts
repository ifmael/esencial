// Zod schemas for every API mutation (spec: fail closed, 400 {error, field}).
import { z } from "zod";
import { MUSCLE_REGION_GROUPS } from "./muscle-regions";

// --- Recipes ---------------------------------------------------------------

export const ingredientSchema = z.object({
  food: z.string().min(1),
  quantity: z.number().positive().optional().nullable(),
  unit: z.string().optional().nullable(),
  section: z.string().optional().nullable(),
  /** Alimento del catálogo `foods`: con él, el ingrediente cuenta en los macros. */
  foodId: z.number().int().positive().optional().nullable(),
  /** Lo opcional no cuenta en los macros. */
  optional: z.boolean().optional().default(false),
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

// --- Foods (catálogo para macros) --------------------------------------------

/** Valores por 100 g (o 100 ml); gramsPerUnit convierte «ud» a gramos. */
export const foodSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio"),
  kcal: z.number().min(0),
  protein: z.number().min(0),
  fat: z.number().min(0),
  carbs: z.number().min(0),
  gramsPerUnit: z.number().positive().optional().nullable(),
});

// --- Exercises -------------------------------------------------------------

export const KINDS = ["strength", "running", "bike"] as const;

/** Grado de implicación de un músculo en un ejercicio, de más a menos. */
export const REGION_ROLES = ["primary", "secondary", "stabilizer"] as const;

export const exerciseSchema = z
  .object({
    name: z.string().min(1, "Exercise name is required"),
    description: z.string().optional().nullable(),
    setupCues: z.string().optional().nullable(),
    techniqueUrl: z
      .url("technique_url must be a valid URL")
      .optional()
      .nullable(),
    steps: z
      .array(z.string().min(1, "Each step must be non-empty"))
      .max(40)
      .optional()
      .nullable(),
    tags: z.array(z.string().min(1)).min(1, "At least one tag is required"),
    // Sub-regiones del mapa anatómico con su grado (opcionales: un ejercicio
    // puede quedarse en el nivel del grupo).
    regions: z
      .array(
        z.object({ region: z.string().min(1), role: z.enum(REGION_ROLES) }),
      )
      .optional()
      .default([]),
    kind: z.enum(KINDS).default("strength"),
  })
  .superRefine((v, ctx) => {
    // Fail closed: la sub-región tiene que existir y colgar de un grupo que el
    // ejercicio ya tenga como tag, o filtrar por el grupo padre dejaría de
    // encontrarlo (los dos niveles se contradirían).
    const seen = new Set<string>();
    for (const { region } of v.regions) {
      const parent = MUSCLE_REGION_GROUPS[region];
      const message = seen.has(region)
        ? `region ${region} is repeated`
        : parent && v.tags.includes(parent)
          ? null
          : `region ${region} must hang from one of the exercise tags`;
      seen.add(region);
      if (!message) continue;
      ctx.addIssue({ code: "custom", path: ["regions"], message });
      return;
    }
  });
export type ExerciseInput = z.infer<typeof exerciseSchema>;

// --- Templates -------------------------------------------------------------

/** Descanso programado en segundos: pausa entre series (`restSecs`) o al
 *  terminar el ejercicio (`restAfterSecs`). null = sin descanso. */
const restSeconds = z.number().int().min(1).max(3600).optional().nullable();

export const templateExerciseSchema = z.object({
  exerciseId: z.number().int().positive(),
  targetSets: z.number().int().positive().optional().nullable(),
  targetRepsMin: z.number().int().positive().optional().nullable(),
  targetRepsMax: z.number().int().positive().optional().nullable(),
  targetDistanceKm: z.number().min(0).optional().nullable(),
  targetDurationMin: z.number().int().min(0).optional().nullable(),
  restSecs: restSeconds,
  restAfterSecs: restSeconds,
});

export const templateSchema = z.object({
  name: z.string().min(1, "Template name is required"),
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

/** Un ejercicio planificado en el día: fuerza (series/reps) o cardio (distancia/tiempo). */
export const planSessionItemSchema = z.object({
  exerciseId: z.number().int().positive(),
  targetSets: z.number().int().min(1).optional().nullable(),
  targetRepsMin: z.number().int().min(0).optional().nullable(),
  targetRepsMax: z.number().int().min(0).optional().nullable(),
  targetDistanceKm: z.number().min(0).optional().nullable(),
  targetDurationMin: z.number().int().min(0).optional().nullable(),
  restSecs: restSeconds,
  restAfterSecs: restSeconds,
});

export const planSessionCreateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  name: z.string().trim().max(80).optional().nullable(),
  items: z
    .array(planSessionItemSchema)
    .min(1, "At least one exercise is required"),
});

export const planSessionUpdateSchema = z.object({
  name: z.string().trim().max(80).optional().nullable(),
  items: z
    .array(planSessionItemSchema)
    .min(1, "At least one exercise is required"),
});

// Una serie hecha lleva sus repeticiones; los kilos pueden faltar (sin peso).
export const setLogSchema = z
  .object({
    planSessionExerciseId: z.number().int().positive(),
    setIndex: z.number().int().min(0),
    weightKg: z.number().min(0).optional().nullable(),
    reps: z.number().int().min(0).optional().nullable(),
    done: z.boolean().optional().default(false),
  })
  .refine((s) => !s.done || (s.reps ?? null) !== null, {
    message: "A done set requires reps",
    path: ["reps"],
  });

// Cardio: distancia y tiempo opcionales; `done` sin marcas = hecho sin números.
export const cardioLogSchema = z.object({
  planSessionExerciseId: z.number().int().positive(),
  distanceKm: z.number().min(0).optional().nullable(),
  durationMin: z.number().int().min(0).optional().nullable(),
  done: z.boolean().optional().default(false),
});

export const workoutLogSchema = z.object({
  effort: z.number().int().min(1).max(5, "effort must be 1-5"),
  note: z.string().optional().nullable(),
  sets: z.array(setLogSchema),
  cardio: z.array(cardioLogSchema).optional().default([]),
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
    message:
      "At least one of food, quantity, unit, section, checked is required",
  });
