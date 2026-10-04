/**
 * Fluxo real entre duas pessoas, ponta a ponta, com a criptografia de verdade:
 * Alice envia (cifra), o servidor guarda e entrega, e Bob decifra.
 *
 * É a prova de que o caminho completo funciona — e de que o envelope gravado no
 * banco não contém nada legível. Complementa os testes de integração, que usam
 * um envelope sintético por não dependerem de navegador.
 *
 * Uso:
 *   node tests/integration/smoke.mjs           (servidor no ar)
 * Requer os usuários de teste (ver `backend/prisma/reset-chat-users.ts`).
 */
import { createHmac, webcrypto } from 'crypto';
// Usa a mesma biblioteca do backend para gerar o TOTP: reimplementar o RFC 6238
// aqui só criaria chance de divergir do validador por detalhe de arredondamento.
import { authenticator } from 'otplib';

const BASE = process.env.API_URL ?? 'http://localhost:8080/api';
const ORIGIN = process.env.FRONTEND_URL ?? 'http://localhost:5173';
const PASSWORD = process.env.TEST_SEED_PASSWORD ?? 'Teste#2026Abc';

/* ------------------------------ Sessão HTTP ------------------------------ */

const cookies = new Map();
const jar = () => [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Cookie: jar(),
      Origin: ORIGIN,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(';');
    const i = pair.indexOf('=');
    cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

/* ------------------------------ Criptografia ----------------------------- */

const subtle = webcrypto.subtle;
const b64 = (buf) => Buffer.from(buf).toString('base64');
const unb64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));

const importar = (spkiB64) =>
  subtle.importKey('spki', unb64(spkiB64), { name: 'ECDH', namedCurve: 'P-256' }, false, []);

/** Par de chaves ECDH, com a privada NÃO exportável (como no navegador). */
async function identidade() {
  const gen = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const publica = b64(await subtle.exportKey('spki', gen.publicKey));
  const privada = await subtle.importKey(
    'pkcs8',
    await subtle.exportKey('pkcs8', gen.privateKey),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  );
  // Mesmos nomes do `crypto.service.ts` do app, para o raciocínio bater.
  return { publica, privateKey: privada };
}

/** Mesma derivação do `crypto.service.ts`: ECDH + HKDF com o contexto da conversa. */
async function deriveChave(privada, publica, conversaId, destino) {
  const bits = await subtle.deriveBits({ name: 'ECDH', public: publica }, privada, 256);
  const material = await subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode(`sano:v1:${conversaId}:${destino}`),
      info: new TextEncoder().encode('sano:mensagem'),
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Cifra o conteúdo para cada participante, como o navegador faz. */
async function cifrar(conversaId, participantes, conteudo) {
  const efemera = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const epk = b64(await subtle.exportKey('spki', efemera.publicKey));

  const copies = {};
  for (const p of participantes) {
    // `p.publica` é base64 do SPKI: importa uma vez e usa a CryptoKey direto.
    const chave = await deriveChave(efemera.privateKey, await importar(p.publica), conversaId, p.id);
    const iv = webcrypto.getRandomValues(new Uint8Array(12));
    const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, chave, conteudo);
    copies[p.id] = { iv: b64(iv), ct: b64(ct) };
  }
  return { epk, copies };
}

/** Abre a cópia de `meId` do envelope. */
const decifrar = async (conversaId, meId, envelope, minhaPrivada) => {
  const chave = await deriveChave(minhaPrivada, await importar(envelope.epk), conversaId, meId);
  const { iv, ct } = envelope.copies[meId];
  return Buffer.from(await subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, chave, unb64(ct)));
};

/* --------------------------- Autenticação (TOTP) ------------------------- */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Segredo estável dos usuários de teste — igual ao do `reset-chat-users.ts`. */
function segredoDeTeste(username) {
  const digest = createHmac('sha256', 'sano:test-seed').update(username).digest();
  let out = '';
  for (const b of digest) out += B32[b % B32.length];
  return out.slice(0, 32);
}

const totp = (secretB32) => authenticator.generate(secretB32);

async function entrar(username) {
  cookies.clear();
  const login = await call('POST', '/auth/login', { username, password: PASSWORD });
  if (login.step === 'VERIFY_2FA') {
    await call('POST', '/auth/2fa/verify', { code: totp(segredoDeTeste(username)) });
  }
  return call('GET', '/auth/me').then((r) => r.user);
}

const ok = (m) => console.log(`  ok  ${m}`);
const falha = (m) => { throw new Error(m); };
async function main() {
  console.log('\nFluxo real entre duas pessoas (E2EE)\n');

  const alice = await entrar('alice');
  const bob = await entrar('bob');
  ok(`login: ${alice.username} e ${bob.username}`);

  // Começa de uma conversa nova: outras execuções (e a suíte de integração)
  // deixam mensagens no histórico, e aqui só interessa o que foi cifrado agora.
  const idBob = await identidade();
  const idAlice = await identidade();
  await call('PUT', '/chat/key', { publicKey: idAlice.publica });
  await call('PUT', '/chat/key', { publicKey: idBob.publica });
  ok('chaves públicas E2EE publicadas');

  // O número precisa ser o do DONO da conversa: buscamos na sessão do Bob.
  cookies.clear();
  await entrar('bob');
  const { number } = await call('GET', '/chat/number');
  ok(`número de ${bob.username}: ${number.formatted} (expira em ${Math.round(number.expiresInSeconds / 3600)}h)`);

  // Conversa nova com o Bob, para não pegar mensagens de execuções antigas.
  cookies.clear();
  await entrar('alice');
  const criada = await call('POST', '/chat/conversations/group', {
    name: `smoke ${Date.now()}`,
    invitees: ['bob'],
  });
  const conversation = criada.conversation;
  ok(`grupo de teste criado: ${conversation.title}`);

  // Alice envia um texto e uma "imagem", ambos cifrados.
  const participantes = [
    { id: alice.id, publica: idAlice.publica },
    { id: bob.id, publica: idBob.publica },
  ];

  const segredo = 'isto não pode existir em claro no banco';
  const envelopeTexto = await cifrar(conversation.id, participantes, new TextEncoder().encode(segredo));
  await call('POST', `/chat/conversations/${conversation.id}/messages`, {
    kind: 'TEXT',
    envelope: envelopeTexto,
  });
  ok('texto enviado (cifrado)');

  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5]);
  const envelopeImagem = await cifrar(conversation.id, participantes, new Uint8Array(png));
  await call('POST', `/chat/conversations/${conversation.id}/messages`, {
    kind: 'IMAGE',
    envelope: envelopeImagem,
    meta: { mime: 'image/png', bytes: png.length },
  });
  ok('imagem enviada (cifrada)');

  // Bob recebe e decifra de verdade.
  cookies.clear();
  await entrar('bob');
  const { messages } = await call('GET', `/chat/conversations/${conversation.id}/messages`);

  const texto = messages.find((m) => m.kind === 'TEXT');
  const imagem = messages.find((m) => m.kind === 'IMAGE');

  const aberto = (await decifrar(conversation.id, bob.id, texto.envelope, idBob.privateKey)).toString('utf8');
  if (aberto !== segredo) falha(`texto decifrado errado: ${aberto}`);
  ok('bob decifrou o texto corretamente');

  const bytes = await decifrar(conversation.id, bob.id, imagem.envelope, idBob.privateKey);
  if (!Buffer.from(bytes).equals(png)) falha('imagem decifrada diferente da enviada');
  ok(`bob decifrou a imagem corretamente (${bytes.length} bytes)`);

  // O que está no servidor não tem nada legível.
  const cru = JSON.stringify(messages);
  if (cru.includes(segredo) || cru.includes(segredo.slice(0, 12))) {
    falha('O SERVIDOR GUARDOU TEXTO EM CLARO');
  }
  ok('servidor guardou apenas bytes cifrados');

  // E o remetente também consegue reler o que enviou.
  const relido = (await decifrar(conversation.id, alice.id, texto.envelope, idAlice.privateKey)).toString('utf8');
  if (relido !== segredo) falha('o remetente não conseguiu reler a própria mensagem');
  ok('alice consegue reler a própria mensagem');

  console.log('\nTudo certo: mensagem e imagem foram cifradas antes de sair, gravadas\n' +
    'ilegíveis no servidor e abertas só pelo destinatário.\n');
}

main().catch((e) => {
  console.error('\nFALHOU:', e.message, '\n');
  process.exit(1);
});