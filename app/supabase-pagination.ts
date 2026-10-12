// Keep each request below the database's 1,000-row response limit.
export async function loadAllRows<T>(
  path: string,
  request: (path: string) => Promise<T[]>,
): Promise<T[]> {
  const pageSize = 500;
  const rows: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await request(`${path}${path.includes("?") ? "&" : "?"}limit=${pageSize}&offset=${offset}`);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
