export default function Loading() {
  return (
    <div className="p-6 space-y-4 animate-pulse">
      <div className="h-7 w-48 rounded bg-muted" />
      <div className="h-4 w-64 rounded bg-muted/70" />
      <div className="space-y-2 mt-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 rounded-lg border bg-muted/40" />
        ))}
      </div>
    </div>
  );
}
