/**
 * Teste da criptografia ponta a ponta do Módulo 1, rodando o MESMO código que o
 * navegador executa (`frontend/src/services/crypto.service.ts`).
 *
 * O que ele garante:
 * 1. Chave privada não exportável (um XSS não consegue extraí-la).
 * 2. Ida e volta de texto e de mídia binária.
 * 3. Um terceiro não decifra, mesmo com o envelope inteiro em mãos.
 * 4. O envelope não decifra em outra conversa (chave ligada ao contexto).
 * 5. Envelope adulterado falha em vez de devolver lixo (AES-GCM autentica).
 *
 * Roda no Node porque a Web Crypto API (`crypto.subtle`) é a mesma; só o
 * IndexedDB é substituído por um dublê em memória.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Import estático (o módulo é compilado em CJS, sem top-level await). O dublê
// do IndexedDB abaixo é instalado logo após, antes de qualquer teste chamar
// `getIdentity()` — que é quando o IndexedDB é realmente acessado.
import * as crypto from '../../frontend/src/services/crypto.service.ts';

/* --------------------- Dublê do IndexedDB (o Node não tem) --------------------- */

/** Guarda as identidades em memória, no lugar do IndexedDB do navegador. */
const store = new Map<string, CryptoKeyPair>();

/**
 * O IndexedDB é todo orientado a callback: `open` precisa disparar
 * `onupgradeneeded` e `onsuccess`, e a transação precisa de `oncomplete`.
 * Esquecer qualquer um deles deixa um `await` do serviço pendurado para sempre —
 * por isso o dublê agenda cada callback no próximo tick, como o navegador faz.
 */
const agenda = (target: object, nome: 'onsuccess' | 'oncomplete'): void => {
  Object.defineProperty(target, nome, {
    get: () => null,
    set: (fn: (() => void) | null) => { if (fn) queueMicrotask(() => fn()); },
    configurable: true,
  });
};

/** `get()` devolve o valor e só então chama `onsuccess`. */
const idbGetRequest = (key: string) => {
  const req: { onsuccess: (() => void) | null; result: CryptoKeyPair | undefined } = {
    onsuccess: null,
    result: store.get(key),
  };
  queueMicrotask(() => req.onsuccess?.());
  return req;
};

(globalThis as unknown as { indexedDB: unknown }).indexedDB = {
  open: () => {
    const db = {
      objectStoreNames: { contains: () => true },
      createObjectStore: () => ({}),
      transaction: () => {
        const tx = {
          objectStore: () => ({
            get: idbGetRequest,
            put: (v: unknown, k: string) => { store.set(k, v as CryptoKeyPair); return {}; },
            delete: (k: string) => { store.delete(k); return {}; },
          }),
          onerror: null,
          onabort: null,
        };
        agenda(tx, 'oncomplete');
        return tx;
      },
    };

    const req = { onupgradeneeded: null as (() => void) | null, onerror: null, result: db };
    agenda(req as object, 'onsuccess');
    // `onupgradeneeded` antes de `onsuccess`, como na vida real.
    queueMicrotask(() => {
      req.onupgradeneeded?.();
      req.onsuccess?.();
    });
    return req;
  },
} as never;

/** Base64 do Node, para o mesmo `btoa`/`atob` que o navegador oferece. */
globalThis.btoa ??= (s: string) => Buffer.from(s, 'binary').toString('base64');
globalThis.atob ??= (s: string) => Buffer.from(s, 'base64').toString('binary');

const CONV = 'conversa-123';
const OUTRA_CONV = 'conversa-999';

/** Zera as identidades em memória entre os testes. */
beforeEach(() => store.clear());

const eu = async () => crypto.getIdentity();

/**
 * Faz o módulo se comportar como OUTRO usuário.
 *
 * Sem isso, todo `getIdentity()` devolve a mesma identidade (o cache do módulo)
 * e não dá para ter duas pessoas distintas no mesmo teste — que é justamente o
 * cenário do E2EE. A troca é feita pelo mesmo caminho do app: gravar o par no
 * armazenamento e zerar o cache.
 */
async function comoUsuario(par: CryptoKeyPair) {
  await crypto.resetIdentity();
  store.set('me', par);
  return crypto.getIdentity();
}

/** Gera um par de chaves novo (a identidade de outra pessoa). */
const novoPar = () =>
  globalThis.crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveKey',
    'deriveBits',
  ]) as Promise<CryptoKeyPair>;

/** Gera um par de chaves qualquer e devolve a pública em base64. */
const chavePublica = async () => {
  const pair = await globalThis.crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );
  return crypto.toB64(await globalThis.crypto.subtle.exportKey('spki', pair.publicKey));
};
test('a chave privada é não exportável', async () => {
  const id = await eu();
  // Um XSS neste módulo não consegue extrair a chave privada do IndexedDB.
  assert.equal(id.privateKey.extractable, false);
  // A pública, essa sim, sai — é ela que vai para o servidor.
  assert.equal(id.publicKey.extractable, true);
  assert.ok(id.publicKeyB64.length > 40);
});

test('a identidade é reaproveitada entre chamadas', async () => {
  const a = await eu();
  const b = await eu();
  assert.equal(a.publicKeyB64, b.publicKeyB64, 'a identidade não pode mudar sozinha');
});

test('texto cifrado volta íntegro e não vaza nada em claro', async () => {
  const alice = await eu();
  const bobPub = await chavePublica();

  const texto = 'Segredo que o servidor nunca pode ler. Café ☕';
  const envelope = await crypto.encryptText(
    CONV,
    [{ id: 'alice', publicKey: alice.publicKeyB64 }, { id: 'bob', publicKey: bobPub }],
    texto,
  );

  // O envelope não pode conter nada do texto em claro.
  const serializado = JSON.stringify(envelope);
  assert.equal(serializado.includes('Segredo'), false);
  assert.equal(serializado.includes('Café'), false);
  // E precisa ter uma cópia para cada participante.
  assert.ok(envelope.copies.alice && envelope.copies.bob);

  // Alice decifra a própria cópia.
  assert.equal(await crypto.decryptText(CONV, 'alice', envelope), texto);
});

test('o destinatário decifra a mensagem que o remetente enviou', async () => {
  // Alice é quem está com a identidade carregada: ela envia.
  const alice = await eu();

  // O par do Bob: a mesma chave privada que será usada para abrir, então a
  // pública que o Alice cifra precisa ser a deste par.
  const bobPar = await novoPar();
  const bobPub = crypto.toB64(
    await globalThis.crypto.subtle.exportKey('spki', bobPar.publicKey),
  );

  const texto = 'olá do alice para o bob';
  const envelope = await crypto.encryptText(
    CONV,
    [{ id: 'alice', publicKey: alice.publicKeyB64 }, { id: 'bob', publicKey: bobPub }],
    texto,
  );

  // Agora o navegador passa a se comportar como BOB (a pessoa que recebe).
  await comoUsuario(bobPar);

  // Bob lê a cópia endereçada a ele e recupera o texto.
  assert.equal(await crypto.decryptText(CONV, 'bob', envelope), texto);
});

test('uma terceira pessoa não consegue decifrar', async () => {
  const alice = await eu();

  // O módulo agora é o INTRUSO: tem chave própria e nenhum envelope para ele.
  await comoUsuario(await novoPar());

  const envelope = await crypto.encryptText(CONV, [{ id: 'alice', publicKey: alice.publicKeyB64 }], 'confidencial');

  // Não existe cópia para o intruso.
  await assert.rejects(() => crypto.decryptText(CONV, 'intruso', envelope));

  // E nem falsificando uma cópia: a chave está errada, então o GCM falha.
  const falsificado = { ...envelope, copies: { ...envelope.copies, intruso: envelope.copies.alice } };
  await assert.rejects(() => crypto.decryptText(CONV, 'intruso', falsificado));
});

test('o envelope não decifra em outra conversa', async () => {
  const alice = await eu();
  const envelope = await crypto.encryptText(CONV, [{ id: 'alice', publicKey: alice.publicKeyB64 }], 'da conversa A');

  // Mesma chave, outra conversa: a derivação inclui o id da conversa.
  await assert.rejects(() => crypto.decryptText(OUTRA_CONV, 'alice', envelope));
});

test('envelope adulterado é recusado (AES-GCM autentica)', async () => {
  const alice = await eu();
  const envelope = await crypto.encryptText(CONV, [{ id: 'alice', publicKey: alice.publicKeyB64 }], 'texto original');

  const copia = envelope.copies.alice;
  const ct = Buffer.from(copia.ct, 'base64');
  ct[0] ^= 0xff; // um único bit trobado no texto cifrado
  const adulterado = { ...envelope, copies: { alice: { ...copia, ct: ct.toString('base64') } } };

  await assert.rejects(() => crypto.decryptText(CONV, 'alice', adulterado));
});

test('mídia binária faz a mesma ida e volta', async () => {
  const alice = await eu();
  const bytes = new Uint8Array(1024).map((_, i) => i % 256);

  const envelope = await crypto.encryptBytes(CONV, [{ id: 'alice', publicKey: alice.publicKeyB64 }], bytes);
  const saida = await crypto.decryptFor(CONV, 'alice', envelope);

  assert.equal(saida.length, bytes.length);
  assert.deepEqual([...saida], [...bytes]);
});

test('recusa cifrar para alguém sem chave pública', async () => {
  await eu();
  await assert.rejects(
    () => crypto.encryptText(CONV, [{ id: 'sem-chave', publicKey: null }], 'oi'),
    /ainda não abriu o bate-papo/,
  );
});

test('a chave pública exportada pode ser importada de volta', async () => {
  const spki = await chavePublica();
  const envelope = await crypto.encryptText(CONV, [{ id: 'bob', publicKey: spki }], 'round trip');

  assert.ok(envelope.epk.length > 40);
  assert.equal(envelope.copies.bob.iv.length, 16); // 12 bytes em base64
});
