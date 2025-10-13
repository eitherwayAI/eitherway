import { memo } from 'react';

interface FileOperationProgressProps {
  operations: Array<{ operation: string; filePath: string }>;
}

const operationConfig = {
  creating: {
    label: 'Creating',
    icon: 'i-ph:file-plus',
    color: 'text-blue-400',
    inProgress: true,
  },
  created: {
    label: 'Created',
    icon: 'i-ph:check',
    color: 'text-green-400',
    inProgress: false,
  },
  editing: {
    label: 'Editing',
    icon: 'i-ph:pencil-simple',
    color: 'text-yellow-400',
    inProgress: true,
  },
  edited: {
    label: 'Edited',
    icon: 'i-ph:check',
    color: 'text-green-400',
    inProgress: false,
  },
};

export const FileOperationProgress = memo(({ operations }: FileOperationProgressProps) => {
  if (operations.length === 0) return null;

  // Group operations by file path and keep only the latest operation per file
  const latestOperations = operations.reduce(
    (acc, op) => {
      acc[op.filePath] = op;
      return acc;
    },
    {} as Record<string, { operation: string; filePath: string }>,
  );

  const displayOperations = Object.values(latestOperations).slice(-5); // Show last 5 files

  return (
    <div className="flex flex-col gap-1.5 px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-sm max-w-md">
      <div className="text-white/70 text-xs font-medium mb-1">File Operations</div>
      {displayOperations.map((op, index) => {
        const config = operationConfig[op.operation as keyof typeof operationConfig] || {
          label: op.operation,
          icon: 'i-ph:file',
          color: 'text-white',
          inProgress: false,
        };

        return (
          <div key={`${op.filePath}-${index}`} className="flex items-center gap-2">
            <div className={`${config.icon} ${config.color} text-base ${config.inProgress ? 'animate-pulse' : ''}`} />
            <span className="text-white/60 text-xs truncate flex-1" title={op.filePath}>
              {op.filePath}
            </span>
            <span className={`${config.color} text-xs font-medium`}>{config.label}</span>
          </div>
        );
      })}
    </div>
  );
});
