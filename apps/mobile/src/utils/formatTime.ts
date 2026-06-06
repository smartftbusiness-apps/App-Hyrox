export function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const centis = Math.floor((ms % 1000) / 10);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}

export function formatStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: 'Rascunho',
    open: 'Inscrições',
    live: 'Ao vivo',
    finished: 'Evento encerrado',
    registered: 'Inscrito',
    checked_in: 'Check-in',
    racing: 'Em prova',
    finished_athlete: 'Finalizado',
    dnf: 'DNF',
    dns: 'DNS',
  };
  return labels[status] ?? status;
}
