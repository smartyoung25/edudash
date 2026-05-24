export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="border-b px-6 py-5 space-y-2">
        <div className="h-7 w-48 rounded bg-muted" />
        <div className="h-4 w-72 rounded bg-muted/70" />
      </div>
      <div className="p-6 space-y-5">
        <div className="h-24 rounded-lg border bg-muted/40" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="h-24 rounded-lg border bg-muted/40" />
          ))}
        </div>
      </div>
    </div>
  );
}
