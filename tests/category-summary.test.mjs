import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeCategories } from '../app/category-summary.ts';

test('category totals count products, separate stock units, and value remaining stock', () => {
  const products = [
    {category:'Drinks',unit:'bottle',stock:10,cost:100,price:150},
    {category:' drinks ',unit:'carton',stock:2,cost:1000,price:1500},
    {category:'Drinks',unit:'bottle',stock:0,cost:200,price:300},
    {category:'',unit:'',stock:3,cost:20,price:40},
  ];
  const result = summarizeCategories(products, ['Drinks','Snacks']);
  const drinks = result.find(row => row.name === 'Drinks');
  assert.equal(drinks.productCount, 3);
  assert.deepEqual([...drinks.quantities], [['bottle',10],['carton',2]]);
  assert.equal(drinks.costValue, 3000);
  assert.equal(drinks.sellingValue, 4500);
  assert.equal(result.find(row => row.name === 'Snacks').productCount, 0);
  assert.equal(result.find(row => row.name === 'Uncategorized').sellingValue, 120);
  assert.equal(summarizeCategories([{...products[0], stock:8}])[0].sellingValue, 1200);
  assert.deepEqual(summarizeCategories([]), []);
});
