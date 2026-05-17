const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export class SheetsApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export type SheetMeta = {
  sheetId: number;
  title: string;
  index: number;
};

export type SpreadsheetMeta = {
  spreadsheetId: string;
  properties: { title: string };
  sheets: SheetMeta[];
};

type Fetcher = (init: { method: string; path: string; body?: unknown; query?: Record<string, string | string[] | undefined> }) => Promise<unknown>;

export type ValueRenderOption = 'UNFORMATTED_VALUE' | 'FORMULA' | 'FORMATTED_VALUE';

export function createSheetsClient(getToken: () => Promise<string>): {
  fetcher: Fetcher;
  getSpreadsheet: (id: string) => Promise<SpreadsheetMeta>;
  getValues: (id: string, range: string, opts?: { valueRenderOption?: ValueRenderOption }) => Promise<(string | number)[][]>;
  batchGetValues: (id: string, ranges: string[], opts?: { valueRenderOption?: ValueRenderOption }) => Promise<{ range: string; values?: (string | number)[][] }[]>;
  updateValues: (id: string, range: string, values: (string | number | null)[][]) => Promise<void>;
  clearValues: (id: string, range: string) => Promise<void>;
  batchUpdate: (id: string, requests: object[]) => Promise<{ replies: unknown[] }>;
} {
  const fetcher: Fetcher = async ({ method, path, body, query }) => {
    const token = await getToken();
    const url = new URL(`${BASE}${path}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v == null) continue;
        if (Array.isArray(v)) {
          for (const item of v) url.searchParams.append(k, item);
        } else {
          url.searchParams.set(k, v);
        }
      }
    }
    const res = await fetch(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const json = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
    if (!res.ok) {
      const msg = (json && typeof json === 'object' && 'error' in json && (json as { error: { message?: string } }).error?.message) || `${res.status} ${res.statusText}`;
      throw new SheetsApiError(res.status, json, msg);
    }
    return json;
  };

  return {
    fetcher,

    getSpreadsheet: (id) =>
      fetcher({ method: 'GET', path: `/${encodeURIComponent(id)}`, query: { fields: 'spreadsheetId,properties.title,sheets.properties' } })
        .then((data) => {
          const d = data as { spreadsheetId: string; properties: { title: string }; sheets: { properties: SheetMeta }[] };
          return {
            spreadsheetId: d.spreadsheetId,
            properties: d.properties,
            sheets: d.sheets.map((s) => s.properties),
          };
        }),

    getValues: (id, range, opts) =>
      fetcher({
        method: 'GET',
        path: `/${encodeURIComponent(id)}/values/${encodeURIComponent(range)}`,
        query: {
          valueRenderOption: opts?.valueRenderOption ?? 'UNFORMATTED_VALUE',
          dateTimeRenderOption: 'SERIAL_NUMBER',
        },
      }).then((data) => (data as { values?: (string | number)[][] }).values ?? []),

    batchGetValues: (id, ranges, opts) =>
      fetcher({
        method: 'GET',
        path: `/${encodeURIComponent(id)}/values:batchGet`,
        query: {
          ranges,
          valueRenderOption: opts?.valueRenderOption ?? 'UNFORMATTED_VALUE',
          dateTimeRenderOption: 'SERIAL_NUMBER',
        },
      }).then((data) => (data as { valueRanges?: { range: string; values?: (string | number)[][] }[] }).valueRanges ?? []),

    updateValues: (id, range, values) =>
      fetcher({
        method: 'PUT',
        path: `/${encodeURIComponent(id)}/values/${encodeURIComponent(range)}`,
        query: { valueInputOption: 'USER_ENTERED' },
        body: { values },
      }).then(() => undefined),

    clearValues: (id, range) =>
      fetcher({ method: 'POST', path: `/${encodeURIComponent(id)}/values/${encodeURIComponent(range)}:clear`, body: {} })
        .then(() => undefined),

    batchUpdate: (id, requests) =>
      fetcher({ method: 'POST', path: `/${encodeURIComponent(id)}:batchUpdate`, body: { requests } })
        .then((data) => data as { replies: unknown[] }),
  };
}

export type SheetsClient = ReturnType<typeof createSheetsClient>;
