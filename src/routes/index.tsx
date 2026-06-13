import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  Camera,
  History,
  Loader2,
  LogOut,
  Sparkles,
  Upload,
  Utensils,
  UtensilsCrossed,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResultCard } from "@/components/ResultCard";
import { RequireAuth } from "@/components/RequireAuth";
import { signOut } from "@/hooks/useAuth";
import { analyzeMeal } from "@/lib/api";
import { prepareImageForUpload } from "@/lib/image";
import type { NutritionResult } from "@/lib/nutrition";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import heroMeal from "@/assets/hero-meal.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CalorieCam — Snap a meal, get instant macros" },
      {
        name: "description",
        content:
          "Upload a photo of your meal and instantly get protein, carbs, fat and calories powered by AI.",
      },
      { property: "og:title", content: "CalorieCam — Snap a meal, get instant macros" },
      {
        property: "og:description",
        content: "Instant AI nutrition analytics from any meal photo.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <Index />
    </RequireAuth>
  ),
});

function Index() {
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<NutritionResult | null>(null);
  const [notFoodMessage, setNotFoodMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      // HEIC files sometimes report empty/odd mime types
      const name = file.name.toLowerCase();
      if (!name.endsWith(".heic") && !name.endsWith(".heif")) {
        toast.error("Please upload an image file");
        return;
      }
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Image must be under 20MB");
      return;
    }
    setResult(null);
    setNotFoodMessage(null);
    setLoading(true);

    try {
      // Converts HEIC, downscales to 1568px JPEG — same blob feeds preview + API.
      const { blob, base64, mimeType } = await prepareImageForUpload(file);
      setPreview(URL.createObjectURL(blob));

      const data = await analyzeMeal({
        imageBase64: base64,
        mimeType,
        filename: file.name || "meal.jpg",
      });
      if (!data.isFood) {
        // Not a food photo — nothing was stored. Surface the model's reason.
        setNotFoodMessage(data.message);
        toast.error(data.message);
        return;
      }
      setResult(data.meal.nutrition);
      if (data.cached) {
        toast.info("Same photo analyzed before — showing saved result");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to analyze");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="top-center" />
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[image:var(--gradient-hero)] shadow-[var(--shadow-soft)]">
            <Utensils className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-semibold tracking-tight">CalorieCam</span>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <Link to="/history">
              <History className="mr-1.5 h-4 w-4" />
              History
            </Link>
          </Button>
          <Button variant="ghost" size="sm" className="rounded-full" onClick={() => signOut()}>
            <LogOut className="h-4 w-4" />
          </Button>
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
              <span className="bg-(image:--gradient-hero) bg-clip-text text-transparent">
                Know your macros.
              </span>
            </h1>
            <p className="max-w-md text-base text-muted-foreground sm:text-lg">
              Upload a photo and get an instant breakdown of protein, carbs, fat, fibre and calories
              — no logging, no scales, no guesswork.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                size="lg"
                onClick={() => inputRef.current?.click()}
                disabled={loading}
                className="rounded-full bg-(image:--gradient-hero) text-primary-foreground shadow-[var(--shadow-soft)] hover:opacity-90"
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload photo
              </Button>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>

          <div className="relative">
            <div className="absolute -inset-6 rounded-[2rem] bg-(image:--gradient-warm) blur-2xl opacity-70" />
            <img
              src={heroMeal}
              alt="Healthy meal with salmon, quinoa and avocado"
              width={1536}
              height={1024}
              className="relative aspect-4/3 w-full rounded-[1.75rem] object-cover shadow-(--shadow-card)"
            />
          </div>
        </section>

        <section className="mt-4">
          {(preview || loading || result || notFoodMessage) && (
            <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-(--shadow-card)">
              <div className="grid gap-0 md:grid-cols-2">
                <div className="relative aspect-square bg-muted md:aspect-auto">
                  {preview && (
                    <img src={preview} alt="Your meal" className="h-full w-full object-cover" />
                  )}
                  {loading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/70 backdrop-blur-sm">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <p className="text-sm font-medium text-foreground">Analyzing your meal…</p>
                    </div>
                  )}
                </div>

                <div className="p-6 md:p-8">
                  {result ? (
                    <ResultCard result={result} />
                  ) : notFoodMessage ? (
                    <div className="flex h-full min-h-65 flex-col items-center justify-center text-center">
                      <UtensilsCrossed className="mb-3 h-8 w-8 text-muted-foreground" />
                      <h3 className="font-semibold text-foreground">Not a food photo</h3>
                      <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                        {notFoodMessage}
                      </p>
                    </div>
                  ) : (
                    <div className="flex h-full min-h-65 flex-col items-center justify-center text-center text-muted-foreground">
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
              body: "Protein, carbs, fat, fibre and calories instantly.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-border bg-card p-5">
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
