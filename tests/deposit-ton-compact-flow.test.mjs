import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const view=readFileSync(new URL('../app/webapp/DepositView.jsx',import.meta.url),'utf8');
test('TON initially shows wallet and manual choices, not payment inputs',()=>{
 assert.match(view,/const \[tonTransferMode, setTonTransferMode\] = useState\('choice'\)/);
 assert.match(view,/const tonManualSelected = tonTransferMode === 'manual'/);
 assert.match(view,/const tonWalletActive = Boolean\(tonConnectionRestored && tonAddress && tonWallet && !tonManualSelected\)/);
 assert.match(view,/\{tonDetailsVisible \? \(/);
 assert.match(view,/Connect Wallet/);
 assert.match(view,/Manual Transfer/);
 assert.match(view,/setTonTransferMode\(\(current\) => current === 'manual'/);
 assert.match(view,/createManualTonInvoice\(\)/);
 assert.match(view,/payWithTonConnect/);
});
test('promo code entry on TON is gated until a flow is chosen',()=>{
 assert.match(view,/method === 'ton' && tonDetailsVisible/);
 assert.doesNotMatch(view,/!loading && method !== 'gift' \?/);
});
test('Stars and Gift are compact while all actual payment actions remain',()=>{
 assert.match(view,/Stars to‘ldirish/);
 assert.match(view,/Gift to‘ldirish/);
 assert.doesNotMatch(view,/TELEGRAM COLLECTIBLE/);
 assert.doesNotMatch(view,/TELEGRAM STARS/);
 assert.doesNotMatch(view,/className=\{styles\.steps\}/);
 assert.match(view,/onSubmit=\{payWithStars\}/);
 assert.match(view,/onSubmit=\{submitGift\}/);
 assert.match(view,/action: 'create_gift'/);
 assert.match(view,/action: 'create_ton'/);
 assert.match(view,/sendTransaction\(/);
});
