import assert from 'node:assert/strict';
import test from 'node:test';
import { launchCustomerDisplay, selectCustomerScreen } from '../app/customer-screen.ts';

const cashier = { left: 0, top: 0, isInternal: false };
const customer = { left: -1280, top: 0, availWidth: 1280, availHeight: 720, isInternal: false };

test('excludes the cashier monitor even when currentScreen is a separate object', () => {
  assert.equal(selectCustomerScreen([{ ...cashier }, customer], cashier), customer);
  assert.equal(selectCustomerScreen([{ ...cashier }], cashier), undefined);
  assert.equal(selectCustomerScreen([cashier, customer]), undefined);
});

function mockHost(getScreenDetails) {
  const calls = [];
  const notices = [];
  const popup = {
    closed: false,
    moveTo: (...args) => calls.push(['move', ...args]),
    resizeTo: (...args) => calls.push(['resize', ...args]),
    focus: () => calls.push(['focus']),
  };
  return {
    calls, notices,
    location: { href: 'https://pos.example/register?store=1' },
    open: (...args) => { calls.push(['open', ...args]); return popup; },
    alert: (message) => notices.push(message),
    getScreenDetails,
  };
}

test('reserves the customer route before permission and positions it on the other monitor', async () => {
  const host = mockHost(async () => {
    assert.equal(host.calls.length, 1);
    return { screens: [{ ...cashier }, customer], currentScreen: cashier };
  });
  await launchCustomerDisplay(host);
  assert.match(host.calls[0][1], /customerDisplay=1/);
  assert.match(host.calls[0][1], /store=1/);
  assert.equal(host.calls[0][2], host.calls[1][2]);
  assert.match(host.calls[1][3], /left=-1280,top=0,width=1280,height=720/);
  assert.deepEqual(host.calls[2], ['move', -1280, 0]);
  assert.equal(host.notices.length, 0);
});

test('denied permission and unsupported browsers leave customer route open with manual instructions', async () => {
  for (const api of [undefined, async () => { throw new Error('Denied'); }, async () => ({ screens: [cashier], currentScreen: cashier })]) {
    const host = mockHost(api);
    await launchCustomerDisplay(host);
    assert.equal(host.calls.length, 1);
    assert.match(host.notices[0], /move this window to the customer monitor/);
  }
});

test('blocked popups do not request screen permission', async () => {
  const host = mockHost(async () => assert.fail('Should not request permission'));
  host.open = () => null;
  await launchCustomerDisplay(host);
  assert.match(host.notices[0], /allow pop-ups/);
});
