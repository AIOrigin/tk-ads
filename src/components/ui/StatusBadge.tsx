const statusConfig = {
  pending: { label: 'Pending', className: 'bg-gray-100 text-gray-600' },
  processing: { label: 'Generating', className: 'bg-blue-100 text-blue-700 animate-pulse' },
  completed: { label: 'Ready', className: 'bg-green-100 text-green-700' },
  failed: { label: 'Failed', className: 'bg-red-100 text-red-700' },
  deleted: { label: 'Deleted', className: 'bg-gray-100 text-gray-400' },
};

export function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}
