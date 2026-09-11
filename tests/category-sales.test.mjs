import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeCategorySales } from '../app/category-sales.ts';

test('category sales allocate discounts and reconcile receipt totals and historical cost', () => {
  const products = [{id:'a',category:'Drinks',unit:'bottle'}, {id:'b',category:'Food',unit:'bag'}];
  const items = [{productId:'a',qty:2,price:100,cost:50,discount:20},{productId:'b',qty:1,price:120,cost:60,discount:0}];
  const result = summarizeCategorySales([{id:'s',total:270,cogs:160,items}],products);
  const drinks = result.find(row => row.name === 'Drinks');
  assert.equal(drinks.sales,162);
  assert.equal(drinks.cost,100);
  assert.equal(drinks.receipts.size,1);
  assert.equal(drinks.quantities.get('bottle'),2);
  assert.equal(result.reduce((sum,row) => sum + row.sales,0),270);
  assert.equal(result.reduce((sum,row) => sum + row.cost,0),160);
  const missing = summarizeCategorySales([{id:'s',total:0,cogs:160,items}],[]);
  assert.equal(missing[0].name,'Uncategorized');
  assert.equal(missing[0].receipts.size,1);
  assert.equal(missing[0].products.size,2);
  assert.equal(missing[0].sales,0);
  assert.equal(missing[0].cost,160);
  assert.deepEqual(summarizeCategorySales([],products),[]);
  assert.equal(summarizeCategorySales([{id:'old',total:25,cogs:10,items:[]}],[])[0].sales,25);
});
