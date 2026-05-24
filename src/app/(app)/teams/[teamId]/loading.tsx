export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="border-b px-6 py-5 space-y-3">
        <div className="h-4 w-24 rounded bg-muted/70" />
        <div className="h-8 w-72 rounded bg-muted" />
        <div className="h-4 w-96 rounded bg-muted/70" />
        <div className="grid sm:grid-cols-2 gap-2 max-w-2xl pt-2">
          <div className="h-20 rounded-lg border bg-muted/40" />
          <div className="h-20 rounded-lg border bg-muted/40" />
        </div>
      </div>
      <div className="p-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 rounded-lg border bg-muted/40" />
        ))}
      </div>
    </div>
  );
}
