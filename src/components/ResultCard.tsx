import { MacroBar } from "@/components/MacroBar";
import type { NutritionResult } from "@/lib/nutrition";

export function ResultCard({ result, heading }: { result: NutritionResult; heading?: string }) {
  const totalMacroGrams = result.total.protein + result.total.carbs + result.total.fat || 1;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {heading ?? "Meal analysis"}
        </p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
          {result.food.length} item{result.food.length === 1 ? "" : "s"} detected
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {result.status && result.status.trim().length > 0
            ? result.status
            : "Estimated nutrition for your meal."}
        </p>
      </div>

      <div className="flex items-end gap-2">
        <span className="text-5xl font-bold tabular-nums text-foreground">
          {Math.round(result.total.calories)}
        </span>
        <span className="pb-1.5 text-sm text-muted-foreground">kcal total</span>
      </div>

      <div className="space-y-4">
        <MacroBar
          label="Protein"
          grams={result.total.protein}
          percent={(result.total.protein / totalMacroGrams) * 100}
          colorVar="--protein"
        />
        <MacroBar
          label="Carbs"
          grams={result.total.carbs}
          percent={(result.total.carbs / totalMacroGrams) * 100}
          colorVar="--carbs"
        />
        <MacroBar
          label="Fat"
          grams={result.total.fat}
          percent={(result.total.fat / totalMacroGrams) * 100}
          colorVar="--fat"
        />
        {typeof result.total.fibre === "number" && (
          <MacroBar
            label="Fibre"
            grams={result.total.fibre}
            percent={(result.total.fibre / totalMacroGrams) * 100}
            colorVar="--carbs"
          />
        )}
      </div>

      {result.food.length > 0 && (
        <div className="border-t border-border pt-4">
          <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
            Items detected
          </p>
          <ul className="space-y-1.5">
            {result.food.map((it, i) => (
              <li key={i} className="flex justify-between text-sm text-foreground">
                <span>
                  {it.name}
                  {it.quantity ? (
                    <span className="ml-1 text-muted-foreground">· {it.quantity}</span>
                  ) : null}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {Math.round(it.calories)} kcal
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
