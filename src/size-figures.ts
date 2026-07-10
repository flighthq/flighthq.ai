import baseline from './size.baseline.json';

const sizes: Record<string, number> = baseline;

export function fillSizeFigures(): void {
  const rows = Array.from(document.querySelectorAll<HTMLElement>('.size-row[data-size]'));
  if (rows.length === 0) return;
  const bytesOf = (row: HTMLElement): number => sizes[row.dataset.size ?? ''] ?? 0;
  const max = Math.max(...rows.map(bytesOf), 1);
  for (const row of rows) {
    const bytes = bytesOf(row);
    if (bytes <= 0) continue;
    const kb = row.querySelector<HTMLElement>('.kb');
    const fill = row.querySelector<HTMLElement>('.fill');
    if (kb !== null) kb.textContent = `${(bytes / 1024).toFixed(1)} KB`;
    if (fill !== null) fill.style.width = `${Math.round((bytes / max) * 100)}%`;
  }
}
