type SaleLine = { productId: string; qty: number; price: number; cost: number; discount: number };
type CategorySale = { id: string; total: number; cogs: number; items: SaleLine[] };

export function summarizeCategorySales(sales: CategorySale[], products: { id: string; category: string; unit: string }[]) {
  const byId = new Map(products.map(product => [product.id, product]));
  const groups = new Map<string, {
    name: string; receipts: Set<string>; products: Set<string>;
    quantities: Map<string, number>; sales: number; cost: number;
  }>();
  function groupFor(name: string) {
    const label = name.trim() || "Uncategorized";
    const key = label.toLowerCase();
    if (!groups.has(key)) groups.set(key, { name: label, receipts: new Set(), products: new Set(), quantities: new Map(), sales: 0, cost: 0 });
    return groups.get(key)!;
  }
  for (const sale of sales) {
    if (!sale.items.length) {
      const group = groupFor("Uncategorized");
      group.receipts.add(sale.id);
      group.sales += sale.total;
      group.cost += sale.cogs;
      continue;
    }
    const weights = sale.items.map(item => Math.max(0, item.price * item.qty - item.discount));
    const net = weights.reduce((sum, value) => sum + value, 0);
    const costs = sale.items.map(item => item.cost * item.qty);
    const costTotal = costs.reduce((sum, value) => sum + value, 0);
    let remainingSales = sale.total;
    let remainingCost = sale.cogs;
    sale.items.forEach((item, index) => {
      const product = byId.get(item.productId);
      const group = groupFor(product?.category ?? "Uncategorized");
      const unit = product?.unit.trim().toLowerCase() || "unit (unspecified)";
      const last = index === sale.items.length - 1;
      // Allocate receipt-level discounts proportionally after line discounts.
      // Assign the remainder to the final line so category totals reconcile.
      const amount = last ? remainingSales : sale.total * (net ? weights[index] / net : 1 / sale.items.length);
      const cost = last ? remainingCost : sale.cogs * (costTotal ? costs[index] / costTotal : 1 / sale.items.length);
      remainingSales -= amount;
      remainingCost -= cost;
      group.receipts.add(sale.id);
      group.products.add(item.productId);
      group.quantities.set(unit, (group.quantities.get(unit) ?? 0) + item.qty);
      group.sales += amount;
      group.cost += cost;
    });
  }
  return [...groups.values()].sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name));
}
