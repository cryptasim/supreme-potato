import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { META, decisionFixture } from '../test/fixtures';
import { DecisionDesk } from './DecisionDesk';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function renderDesk(initialUrl = '/?date=2026-01-15') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialUrl]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <DecisionDesk />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DecisionDesk', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/meta') return jsonResponse(META);
      if (url.pathname === '/api/decision') return jsonResponse(decisionFixture(url.searchParams.get('delivery_date')!));
      return jsonResponse({ detail: 'not found' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('shows the forecast run used, its age and the procurement KPIs', async () => {
    renderDesk();
    expect(await screen.findByText(/14 Jan 07:30 UTC/)).toBeInTheDocument();
    expect(screen.getByText(/age 1h 30m at decision/)).toBeInTheDocument();
    expect(screen.getByText(/Next run 09:30 lands 30m after cut-off/)).toBeInTheDocument();
    expect(screen.getByText('315.6 GWh')).toBeInTheDocument(); // forecast energy
    expect(screen.getByText('265.2 GWh')).toBeInTheDocument(); // reliable P10
    expect(screen.getByText('50.4 GWh')).toBeInTheDocument(); // extra to procure

    const decisionCall = fetchMock.mock.calls.map((c) => String(c[0])).find((u) => u.includes('/api/decision'));
    expect(decisionCall).toContain('delivery_date=2026-01-15');
    expect(decisionCall).toContain('cutoff=09%3A00');
    expect(decisionCall).toContain('actual_mode=point');
  });

  it('steps to the next delivery day and refetches', async () => {
    renderDesk();
    await screen.findByText(/14 Jan 07:30 UTC/);
    await userEvent.click(screen.getByRole('button', { name: 'Next delivery day' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('delivery_date=2026-01-16'))).toBe(true),
    );
  });

  it('disables "previous" on the first day of the window', async () => {
    renderDesk('/?date=2026-01-02');
    await screen.findByText(/forecast run used/i);
    expect(screen.getByRole('button', { name: 'Previous delivery day' })).toBeDisabled();
  });

  it('expands the hourly detail table', async () => {
    renderDesk();
    await screen.findByText(/14 Jan 07:30 UTC/);
    await userEvent.click(screen.getByRole('button', { name: /show hourly detail/i }));
    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();
    // header + 24 hours
    expect(screen.getAllByRole('row')).toHaveLength(25);
  });

  it('shows the API error detail with a retry button', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/meta') return jsonResponse(META);
      return jsonResponse({ detail: 'delivery_date outside window' }, 422);
    });
    renderDesk();
    expect(await screen.findByRole('alert')).toHaveTextContent('delivery_date outside window');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
