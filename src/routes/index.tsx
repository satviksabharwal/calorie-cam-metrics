import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Camera, Loader2, Sparkles, Upload, Utensils, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MacroBar } from "@/components/MacroBar";
import { analyzeMeal, type NutritionResult } from "@/server/analyze.functions";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import heroMeal from "@/assets/hero-meal.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Calories AI — Snap a meal, get instant macros" },
      {
        name: "description",
        content:
          "Upload a photo of your meal and instantly get protein, carbs, fat and calories powered by AI.",
      },
      { property: "og:title", content: "Calories AI — Snap a meal, get instant macros" },
      {
        property: "og:description",
        content: "Instant AI nutrition analytics from any meal photo.",
      },
    ],
  }),
  component: Index,
});

function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? "";
      resolve({ base64, mimeType: file.type || "image/jpeg" });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function Index() {
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<NutritionResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be under 10MB");
      return;
    }
    setResult(null);
    setPreview(URL.createObjectURL(file));
    setLoading(true);
    try {
      const { base64, mimeType } = await fileToBase64(file);
      const data = await analyzeMeal({ data: { imageBase64: base64, mimeType } });
      setResult(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to analyze");
    } finally {
      setLoading(false);
    }
  };

  const totalMacroGrams = result
    ? result.total.protein + result.total.carbs + result.total.fat
    : 0;

  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="top-center" />
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[image:var(--gradient-hero)] shadow-[var(--shadow-soft)]">
            <Utensils className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Calories AI</span>
        </div>
        <div className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground sm:flex">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Powered by Lovable AI
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-20">
        <section className="grid items-center gap-10 py-8 md:grid-cols-2 md:py-14">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <Zap className="h-3.5 w-3.5 text-accent" />
              Instant macro analytics
            </div>
            <h1 className="text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl md:text-6xl">
              Snap your meal.{" "}
              <span className="bg-[image:var(--gradient-hero)] bg-clip-text text-transparent">
                Know your macros.
              </span>
            </h1>
            <p className="max-w-md text-base text-muted-foreground sm:text-lg">
              Upload a photo and get an instant breakdown of protein, carbs, fat
              and calories — no logging, no scales, no guesswork.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                size="lg"
                onClick={() => inputRef.current?.click()}
                disabled={loading}
                className="rounded-full bg-[image:var(--gradient-hero)] text-primary-foreground shadow-[var(--shadow-soft)] hover:opacity-90"
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload photo
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => cameraRef.current?.click()}
                disabled={loading}
                className="rounded-full"
              >
                <Camera className="mr-2 h-4 w-4" />
                Take photo
              </Button>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>

          <div className="relative">
            <div className="absolute -inset-6 rounded-[2rem] bg-[image:var(--gradient-warm)] blur-2xl opacity-70" />
            <img
              src={heroMeal}
              alt="Healthy meal with salmon, quinoa and avocado"
              width={1536}
              height={1024}
              className="relative aspect-[4/3] w-full rounded-[1.75rem] object-cover shadow-[var(--shadow-card)]"
            />
          </div>
        </section>

        <section className="mt-4">
          {(preview || loading || result) && (
            <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-[var(--shadow-card)]">
              <div className="grid gap-0 md:grid-cols-2">
                <div className="relative aspect-square bg-muted md:aspect-auto">
                  {preview && (
                    <img
                      src={preview}
                      alt="Your meal"
                      className="h-full w-full object-cover"
                    />
                  )}
                  {loading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/70 backdrop-blur-sm">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <p className="text-sm font-medium text-foreground">
                        Analyzing your meal…
                      </p>
                    </div>
                  )}
                </div>

                <div className="p-6 md:p-8">
                  {result ? (
                    <div className="space-y-6">
                      <div>
                        <p className="text-xs uppercase tracking-wider text-muted-foreground">
                          Meal analysis
                        </p>
                        <h2 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
                          {result.food.length} item{result.food.length === 1 ? "" : "s"} detected
                        </h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Estimated nutrition for your meal.
                        </p>
                      </div>

                      <div className="flex items-end gap-2">
                        <span className="text-5xl font-bold tabular-nums text-foreground">
                          {Math.round(result.total.calories)}
                        </span>
                        <span className="pb-1.5 text-sm text-muted-foreground">
                          kcal total
                        </span>
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
                      </div>

                      {result.food.length > 0 && (
                        <div className="border-t border-border pt-4">
                          <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                            Items detected
                          </p>
                          <ul className="space-y-1.5">
                            {result.food.map((it, i: number) => (
                              <li
                                key={i}
                                className="flex justify-between text-sm text-foreground"
                              >
                                <span>
                                  {it.name}
                                  {it.quantity ? (
                                    <span className="ml-1 text-muted-foreground">
                                      · {it.quantity}
                                    </span>
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
                  ) : (
                    <div className="flex h-full min-h-[260px] flex-col items-center justify-center text-center text-muted-foreground">
                      <Sparkles className="mb-3 h-8 w-8 text-primary" />
                      <p className="text-sm">
                        {loading
                          ? "Crunching the numbers…"
                          : "Your nutrition breakdown will appear here."}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="mt-16 grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: Camera,
              title: "Snap or upload",
              body: "From your camera roll or live shot.",
            },
            {
              icon: Sparkles,
              title: "AI analyzes",
              body: "Vision model identifies food and portions.",
            },
            {
              icon: Zap,
              title: "Macros in seconds",
              body: "Protein, carbs, fat and calories instantly.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-2xl border border-border bg-card p-5"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-secondary">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        Estimates are approximate. Use as guidance, not medical advice.
      </footer>
    </div>
  );
}
