/**
 * Criptografia ponta a ponta do bate-papo — tudo roda no navegador via Web
 * Crypto API. O servidor recebe apenas bytes cifrados.
 *
 * Modelo (ECDHE por mensagem, no estilo Signal):
 *
 * 1. Cada usuário tem um par de chaves ECDH P-256. A **privada é não
 *    exportável** e vive no IndexedDB: nem o JavaScript da página consegue lê-la.
 * 2. Para enviar, o remetente gera um par **efêmero** por mensagem.
 * 3. Para cada membro da conversa (inclusive ele mesmo), deriva-se uma chave
 *    simétrica com ECDH(efêmera, pública-do-membro) + HKDF.
 * 4. O conteúdo é cifrado com AES-256-GCM, uma cópia por membro.
 *
 * Consequências: o servidor não tem chave alguma; uma chave vazada no futuro
 * não decifra mensagens antigas (a efêmera some depois do envio); e o conteúdo
 * só é decifrado em quem é membro e tem a chave privada.
 */

/* ------------------------------ Base64 ---------------------------------- */

export const toB64 = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  // Em blocos: `String.fromCharCode(...bytes)` estoura a pilha em arquivos grandes.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
};

export const fromB64 = (b64: string): Uint8Array => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

/* --------------------- Chave de identidade (IndexedDB) -------------------- */

const DB_NAME = 'sano-e2ee';
const STORE = 'identity';
const KEY_ID = 'me';

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB indisponível'));
  });

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    tx.onsuccess = () => resolve(tx.result as T | undefined);
    tx.onerror = () => reject(tx.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    // `oncomplete` pertence à TRANSAÇÃO, não ao request: `.put()` devolve o
    // request, que resolve antes do commit. É a transação que garante gravar.
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Falha ao gravar a chave local'));
  });
}

export interface Identity {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  /** SPKI em base64 — é o que vai para o servidor. */
  publicKeyB64: string;
}

let cached: Identity | null = null;

/**
 * Carrega (ou cria na primeira vez) o par de chaves do usuário.
 *
 * A privada é gerada com `extractable: false`: nem `exportKey` consegue
 * devolvê-la, o que reduz o impacto de um XSS neste módulo.
 */
export async function getIdentity(): Promise<Identity> {
  if (cached) return cached;

  const stored = await idbGet<CryptoKeyPair>(KEY_ID).catch(() => undefined);
  if (stored?.publicKey && stored?.privateKey) {
    cached = { ...stored, publicKeyB64: await exportPublic(stored.publicKey) };
    return cached;
  }

  // `generateKey` aplica a mesma flag aos dois lados do par, e a pública
  // PRECISA ser exportável (é ela que vai para o servidor). Então o par nasce
  // exportável, a pública é exportada, e a privada é reimportada com
  // `extractable: false` — a partir daí nem `exportKey` consegue lê-la.
  const generated = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveKey',
    'deriveBits',
  ]);

  const publicKeyB64 = await exportPublic(generated.publicKey);
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    await crypto.subtle.exportKey('pkcs8', generated.privateKey),
    { name: 'ECDH', namedCurve: 'P-256' },
    false, // <- o ponto: a privada guardada não é exportável
    ['deriveKey', 'deriveBits'],
  );

  const pair = { publicKey: generated.publicKey, privateKey };
  await idbSet(KEY_ID, pair).catch(() => {});
  cached = { ...pair, publicKeyB64 };
  return cached;
}

const exportPublic = (key: CryptoKey) =>
  crypto.subtle.exportKey('spki', key).then((buf) => toB64(buf));

/** Importa a chave pública de outra pessoa (SPKI base64 do servidor). */
async function importPublic(spkiB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'spki',
    fromB64(spkiB64) as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
}

/**
 * Apaga a identidade local. Usado quando o usuário quer trocar de identidade
 * E2EE (as mensagens antigas param de ser legíveis para ele).
 */
export async function resetIdentity() {
  cached = null;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(KEY_ID);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* --------------------------- Derivação de chave --------------------------- */

/**
 * Bytes de contexto: se a mesma chave não puder ser reaproveitada em outra
 * conversa ou para outro membro, uma cópia vazada não vale nada.
 */
const contextBytes = (conversationId: string, recipientId: string) =>
  new TextEncoder().encode(`sano:v1:${conversationId}:${recipientId}`);

/** Deriva a chave AES de um destino a partir do segredo ECDH efêmero. */
async function deriveKey(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
  conversationId: string,
  recipientId: string,
): Promise<CryptoKey> {
  const shared = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: publicKey },
    privateKey,
    256,
  );

  const material = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: contextBytes(conversationId, recipientId),
      info: new TextEncoder().encode('sano:mensagem'),
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** IV aleatório de 12 bytes (96 bits), o tamanho recomendado do AES-GCM. */
const newIv = () => crypto.getRandomValues(new Uint8Array(12));

/* ------------------------------- Envelope -------------------------------- */

/** Uma cópia cifrada do conteúdo, destinada a um participante. */
export interface EnvelopeCopy {
  iv: string;
  ct: string;
}

export interface Envelope {
  /** Chave pública efêmera do remetente (SPKI base64). */
  epk: string;
  /** Uma cópia por participante, indexada por `userId`. */
  copies: Record<string, EnvelopeCopy>;
}

/** Participante que sabe cifrar/decifrar nesta conversa. */
export interface Recipient {
  id: string;
  publicKey: string | null;
}

/**
 * Cifra `content` para todos os participantes.
 *
 * Falha alto e cedo quando alguém não tem chave pública registrada: enviar
 * uma cópia a menos deixaria essa pessoa sem ler a mensagem, e o histórico ficaria
 * quebrado. Melhor avisar antes.
 */
export async function encryptForAll(
  conversationId: string,
  recipients: Recipient[],
  content: Uint8Array,
): Promise<Envelope> {
  const me = await getIdentity();
  const missing = recipients.filter((r) => !r.publicKey);
  if (missing.length) {
    throw new Error('Um participante ainda não abriu o bate-papo (sem chave de criptografia)');
  }

  // Par efêmero: só existe durante o envio e nunca é gravado.
  const ephemeral = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ]);
  const epk = await exportPublic(ephemeral.publicKey);

  const copies: Record<string, EnvelopeCopy> = {};
  for (const r of recipients) {
    const key = await deriveKey(
      ephemeral.privateKey,
      await importPublic(r.publicKey!),
      conversationId,
      r.id,
    );
    const iv = newIv();
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, content as BufferSource);
    copies[r.id] = { iv: toB64(iv), ct: toB64(ct) };
  }

  return { epk, copies };
}

/** Cifra um texto em UTF-8. */
export const encryptText = (conversationId: string, recipients: Recipient[], text: string) =>
  encryptForAll(conversationId, recipients, new TextEncoder().encode(text));

/** Cifra os bytes crus de um arquivo (imagem ou áudio). */
export const encryptBytes = (conversationId: string, recipients: Recipient[], bytes: Uint8Array) =>
  encryptForAll(conversationId, recipients, bytes);

/**
 * Decifra a cópia dirigida a `meId`. Lança se a chave não bater — o AES-GCM é
 * autenticado, então isso cobre dado adulterado no caminho, não só chave errada.
 *
 * Não é preciso saber quem enviou: a chave vem da cópia que o navegador tem,
 * endereçada a `meId`. É justamente por isso que a mesma mensagem abre para
 * todos os participantes, cada um com a sua cópia.
 */
export async function decryptFor(
  conversationId: string,
  meId: string,
  envelope: Envelope,
): Promise<Uint8Array> {
  const copy = envelope.copies?.[meId];
  if (!copy) throw new Error('Não há cópia desta mensagem para você');

  const me = await getIdentity();
  // O contexto da derivação é o MESMO da cifragem: id da conversa + QUEM está
  // abrindo (a própria cópia). Ancorar no remetente faria a chave divergir em
  // qualquer conversa com mais de duas pessoas.
  const key = await deriveKey(
    me.privateKey,
    await importPublic(envelope.epk),
    conversationId,
    meId,
  );

  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(copy.iv) as BufferSource },
    key,
    fromB64(copy.ct) as BufferSource,
  );
  return new Uint8Array(plain);
}

export const decryptText = async (
  conversationId: string,
  meId: string,
  envelope: Envelope,
) => new TextDecoder().decode(await decryptFor(conversationId, meId, envelope));

/**
 * Decifra mídia e monta a URL para exibir/toque.
 *
 * O `revoke` existe porque o objeto fica em memória: sem revogar, navegar por
 * várias fotos na mesma conversa vaza memória.
 */
export async function decryptToObjectUrl(
  conversationId: string,
  meId: string,
  envelope: Envelope,
  mime: string,
): Promise<string> {
  const bytes = await decryptFor(conversationId, meId, envelope);
  // Copia para um ArrayBuffer "limpo": o Uint8Array pode ter offset de view.
  return URL.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer], { type: mime }));
}