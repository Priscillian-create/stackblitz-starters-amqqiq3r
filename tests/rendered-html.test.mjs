import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("POS source includes the core business functions", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const packageJson = await readFile(new URL("../package.json", import.meta.url), "utf8");

  assert.match(layout, /PA GERRY POS/);
  assert.match(packageJson, /pa-gerrys-mart-pos/);
  assert.match(page, /completeSale/);
  assert.match(page, /refundSale/);
  assert.match(page, /grossProfit/);
  assert.match(page, /netProfit/);
  assert.match(page, /Payment Analysis/);
  assert.match(page, /Recent Activity/);
  assert.doesNotMatch(page, /SkeletonPreview|codex-preview/);
});
