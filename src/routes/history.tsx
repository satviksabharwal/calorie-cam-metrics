import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Camera, ImageOff, Loader2, LogOut, Utensils } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { ResultCard } from "@/components/ResultCard";
import { signOut } from "@/hooks/useAuth";
import { getDailyTotals, getRecentMeals } from "@/lib/api";
import type { DailyTotal, Meal } from "@/lib/nutrition";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [{ title: "History — CalorieCam" }],
  }),
  component: () => (
    <RequireAuth>
      <History />
    </RequireAuth>
  ),
});

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function History() {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [days, setDays] = useState<DailyTotal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getRecentMeals(), getDailyTotals()])
      .then(([recent, totals]) => {
        setMeals(recent.meals);
        setDays(totals.days);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load history"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="top-center" />
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[image:var(--gradient-hero)] shadow-[var(--shadow-soft)]">
            <Utensils className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-semibold tracking-tight">CalorieCam</span>
        </Link>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <Link to="/">
              <Camera className="mr-1.5 h-4 w-4" />
              Analyze
            </Link>
          </Button>
          <Button variant="ghost" size="sm" className="rounded-full" onClick={() => signOut()}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-20">
        <h1 className="py-6 text-3xl font-bold tracking-tight text-foreground">
          Your meal history
        </h1>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-12">
            <section>
              <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Last 7 days
              </h2>
              {meals.length === 0 ? (
                <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
                  No meals yet this week.{" "}
                  <Link to="/" className="font-medium text-primary hover:underline">
                    Analyze your first meal
                  </Link>
                  .
                </p>
              ) : (
                <div className="space-y-6">
                  {meals.map((meal) => (
                    <div
                      key={meal.id}
                      className="overflow-hidden rounded-3xl border border-border bg-card shadow-[var(--shadow-card)]"
                    >
                      <div className="grid gap-0 md:grid-cols-2">
                        <div className="relative h-56 bg-muted md:h-full">
                          {meal.imageUrl ? (
                            <img
                              src={meal.imageUrl}
                              alt="Meal"
                              className="absolute inset-0 h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 text-muted-foreground">
                              <ImageOff className="h-8 w-8" />
                              <span className="text-xs">Photo expired</span>
                            </div>
                          )}
                        </div>
                        <div className="p-6 md:p-8">
                          <ResultCard
                            result={meal.nutrition}
                            heading={`${formatDay(meal.createdAt)} · ${formatTime(meal.createdAt)}`}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Earlier — daily totals
              </h2>
              {days.length === 0 ? (
                <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
                  Older daily summaries will appear here once meals are more than a week old.
                </p>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-border bg-card">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="px-4 py-3 font-medium">Day</th>
                        <th className="px-4 py-3 text-right font-medium">Meals</th>
                        <th className="px-4 py-3 text-right font-medium">kcal</th>
                        <th className="hidden px-4 py-3 text-right font-medium sm:table-cell">
                          Protein
                        </th>
                        <th className="hidden px-4 py-3 text-right font-medium sm:table-cell">
                          Carbs
                        </th>
                        <th className="hidden px-4 py-3 text-right font-medium sm:table-cell">
                          Fat
                        </th>
                        <th className="hidden px-4 py-3 text-right font-medium sm:table-cell">
                          Fibre
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {days.map((d) => (
                        <tr key={d.date} className="border-b border-border last:border-0">
                          <td className="px-4 py-3 text-foreground">{formatDay(d.date)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                            {d.mealCount}
                          </td>
                          <td className="px-4 py-3 text-right font-medium tabular-nums text-foreground">
                            {Math.round(d.calories)}
                          </td>
                          <td className="hidden px-4 py-3 text-right tabular-nums text-muted-foreground sm:table-cell">
                            {Math.round(d.protein)} g
                          </td>
                          <td className="hidden px-4 py-3 text-right tabular-nums text-muted-foreground sm:table-cell">
                            {Math.round(d.carbs)} g
                          </td>
                          <td className="hidden px-4 py-3 text-right tabular-nums text-muted-foreground sm:table-cell">
                            {Math.round(d.fat)} g
                          </td>
                          <td className="hidden px-4 py-3 text-right tabular-nums text-muted-foreground sm:table-cell">
                            {Math.round(d.fibre)} g
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
