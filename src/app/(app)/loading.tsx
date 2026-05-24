export default function Loading() {
  return (
    <div className="p-6 space-y-4 animate-pulse">
      <div className="h-7 w-64 rounded-md bg-muted" />
      <div className="h-4 w-96 rounded bg-muted/70" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mt-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 rounded-lg border bg-muted/40" />
        ))}
      </div>
    </div>
  );
}
