type Props = {
  label: string;
  grams: number;
  percent: number;
  colorVar: string;
};

export function MacroBar({ label, grams, percent, colorVar }: Props) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-sm tabular-nums text-muted-foreground">
          {grams.toFixed(1)}g · {Math.round(percent)}%
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${Math.max(2, Math.min(100, percent))}%`,
            backgroundColor: `var(${colorVar})`,
          }}
        />
      </div>
    </div>
  );
}