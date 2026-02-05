export function ErrorPanel({
  title,
  message,
}: {
  title?: string;
  message: string;
}) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/50">
      {title && (
        <h4 className="text-sm font-medium text-red-800 dark:text-red-300">
          {title}
        </h4>
      )}
      <p className="mt-1 text-sm text-red-700 dark:text-red-400">{message}</p>
    </div>
  );
}
