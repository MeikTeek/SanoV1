import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOfx } from '../../frontend/src/components/finance/format';

// Trecho no formato SGML (OFX 1.x), como o exportado pelos bancos brasileiros.
const SAMPLE = `OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261015000000[-3:BRT]
<TRNAMT>-45.90
<FITID>202610150001
<MEMO>COMPRA CARTAO - MERCADO X
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261005
<TRNAMT>6500.00
<FITID>202610050007
<NAME>EMPRESA LTDA
<MEMO>SALARIO OUT
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

test('lê transações OFX com data, valor, descrição e FITID', () => {
  assert.deepEqual(parseOfx(SAMPLE), [
    { date: '2026-10-15', amount: '-45.90', payee: 'COMPRA CARTAO - MERCADO X', notes: undefined, externalId: '202610150001' },
    { date: '2026-10-05', amount: '6500.00', payee: 'EMPRESA LTDA', notes: 'SALARIO OUT', externalId: '202610050007' },
  ]);
});

test('arquivo sem transações devolve lista vazia', () => {
  assert.deepEqual(parseOfx('<OFX></OFX>'), []);
});
