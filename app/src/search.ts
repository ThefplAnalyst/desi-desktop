// Google search (FR-01). The form works without JavaScript; this only trims, blocks blank
// submissions and focuses the box on desktop.

export function initSearch(form: HTMLFormElement, input: HTMLInputElement): void {
  form.addEventListener('submit', (e) => {
    const q = input.value.trim();
    if (!q) {
      e.preventDefault();
      input.value = '';
      return;
    }
    input.value = q;
  });
  // Desktop only: focusing on phones would pop up the keyboard over the page.
  if (window.matchMedia('(pointer: fine)').matches && !location.hash) input.focus();
}

export function greeting(now: Date): string {
  const hr = now.getHours();
  if (hr < 5) return 'Good evening';
  if (hr < 12) return 'Good morning';
  if (hr < 17) return 'Good afternoon';
  return 'Good evening';
}

export function todayText(now: Date): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(now);
}
