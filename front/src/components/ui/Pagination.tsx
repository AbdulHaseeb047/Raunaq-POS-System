import { Button } from './Button';

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total?: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1 && (total == null || total <= (pageSize ?? 0))) return null;

  const pages = Math.max(1, totalPages);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
      <p className="text-sm text-text-muted">
        Page {page} of {pages}
        {total != null ? ` · ${total} total` : ''}
      </p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
