interface CommandLineProps {
  command: string;
}

export function CommandLine({ command }: CommandLineProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm text-slate-700 shadow-sm">
      <span className="select-none text-blue-500">$</span>
      <code className="overflow-x-auto whitespace-pre">{command}</code>
    </div>
  );
}
