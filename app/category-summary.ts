type CategoryProduct = {
  category: string;
  unit: string;
  stock: number;
  cost: number;
  price: number;
};

export function summarizeCategories(products: CategoryProduct[], categories: string[] = []) {
  const summaries = new Map<string, {
    name: string;
    productCount: number;
    quantities: Map<string, number>;
    costValue: number;
    sellingValue: number;
  }>();
  function getCategory(category: string) {
    const name = category.trim() || "Uncategorized";
    const key = name.toLowerCase();
    if (!summaries.has(key)) {
      summaries.set(key, { name, productCount: 0, quantities: new Map(), costValue: 0, sellingValue: 0 });
    }
    return summaries.get(key)!;
  }
  categories.forEach(getCategory);
  for (const product of products) {
    const summary = getCategory(product.category);
    const unit = product.unit.trim().toLowerCase() || "unit";
    summary.productCount += 1;
    summary.quantities.set(unit, (summary.quantities.get(unit) ?? 0) + product.stock);
    summary.costValue += product.cost * product.stock;
    summary.sellingValue += product.price * product.stock;
  }
  return [...summaries.values()].sort((a, b) => a.name.localeCompare(b.name));
}
