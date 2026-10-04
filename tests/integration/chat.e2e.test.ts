/**
 * Teste de integração do Módulo 1 contra a API HTTP de verdade.
 *
 * Cobre o caminho que o usuário faz: login → número de 15h → DM pelo código →
 * perfil/seguir → grupo → mensagem cifrada → mídia → saída do grupo.
 *
 * Precisa do servidor no ar (`npm run dev:api`) e dos usuários `alice`/`bob`
 * do seed. Sem servidor, os testes são pulados — não quebrados.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'crypto';
import { authenticator } from 'otplib';

const BASE = process.env.API_URL ?? 'http://localhost:8080/api';
const PASSWORD = process.env.TEST_SEED_PASSWORD ?? 'Teste#2026Abc';

/** Mesmo alfabeto do `reset-chat-users.ts`: o segredo é derivado do nome. */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Segredo TOTP estável do usuário de teste — idêntico ao gravado por
 * `prisma/reset-chat-users.ts`. Sem isso o 2FA tornaria o teste impossível de
 * rodar de forma automática: o segredo real está cifrado no banco.
 */
function testSecret(username: string): string {
  const digest = createHmac('sha256', 'sano:test-seed').update(username).digest();
  let out = '';
  for (const byte of digest) out += B32[byte % B32.length];
  return out.slice(0, 32);
}

/** Sessão com cookies, no mesmo formato que o `fetch` do navegador usa. */
class Session {
  private cookies = new Map<string, string>();

  private store(res: Response) {
    const raw = res.headers.getSetCookie?.() ?? [];
    for (const line of raw) {
      const [pair] = line.split(';');
      const idx = pair.indexOf('=');
      this.cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  }

  header(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  async call(method: string, path: string, body?: unknown) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        Cookie: this.header(),
        Origin: process.env.TEST_ORIGIN ?? 'http://localhost:5173', // exigido pelo originCheck
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    this.store(res);
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data: data as Record<string, never> };
  }

  get = (p: string) => this.call('GET', p);
  post = (p: string, b?: unknown) => this.call('POST', p, b);
  put = (p: string, b?: unknown) => this.call('PUT', p, b);
  del = (p: string) => this.call('DELETE', p);
}

/** Ids e conversas descobertos ao longo dos testes (rodam em ordem). */
const ids = { alice: '', bob: '', dm: '', group: '' };

let alice: Session;
let bob: Session;

/**
 * Estado compartilhado, preenchido no `before`.
 *
 * Não dá para usar `skip` aqui: ele é avaliado na DEFINIÇÃO do teste (antes do
 * `before` rodar) e o módulo é compilado em CJS, onde top-level await não
 * existe. A alternativa é o wrapper `caso`, que decide dentro do corpo.
 */
const env = { serverUp: false };

async function login(username: string): Promise<Session> {
  const s = new Session();
  const res = await s.post('/auth/login', { username, password: PASSWORD });
  assert.equal(res.status, 200, `login de ${username} falhou: ${JSON.stringify(res.data)}`);

  // O hub exige 2FA. Se for o primeiro acesso, configuramos agora; caso
  // contrário, validamos o código do segredo estável do usuário de teste.
  const step = (res.data as unknown as { step: string }).step;
  if (step === 'SETUP_2FA') {
    const setup = await s.post('/auth/2fa/setup', {});
    const secret = (setup.data as unknown as { secret: string }).secret;
    // O `confirm` já conclui o login e emite o cookie de sessão.
    assert.equal((await s.post('/auth/2fa/confirm', { code: authenticator.generate(secret) })).status, 200);
  } else if (step === 'VERIFY_2FA') {
    const code = authenticator.generate(testSecret(username));
    const v = await s.post('/auth/2fa/verify', { code });
    assert.equal(v.status, 200, `2FA de ${username} falhou: ${JSON.stringify(v.data)}`);
  }
  return s;
}

/** Envelope falso: o servidor valida o formato, nunca o conteúdo. */
const fakeEnvelope = (userIds: string[]) => ({
  epk: 'B'.repeat(88),
  copies: Object.fromEntries(userIds.map((id) => [id, { iv: 'C'.repeat(16), ct: 'b3BxdWU=' }])),
});

const conversations = (s: Session) =>
  s.get('/chat/conversations').then((r) => (r.data.conversations as unknown as { id: string }[]).map((c) => c.id));

/**
 * Caso de teste que só roda com a API no ar.
 *
 * Sem servidor, o corpo vira um `t.skip` — o teste aparece como pulado, com o
 * motivo, em vez de falhar por não conseguir conectar.
 */
function caso(name: string, fn: () => Promise<void>) {
  test(name, async (t) => {
    if (!env.serverUp) {
      t.skip(`API fora do ar em ${BASE} — rode "npm run dev:api"`);
      return;
    }
    await fn();
  });
}

before(async () => {
  try {
    env.serverUp = (await fetch(`${BASE}/health`)).ok;
  } catch {
    env.serverUp = false;
  }
  if (!env.serverUp) return;

  alice = await login('alice');
  bob = await login('bob');

  const me = await alice.get('/auth/me');
  ids.alice = (me.data.user as unknown as { id: string }).id;
  const bobProfile = await alice.get('/chat/profiles/bob');
  ids.bob = (bobProfile.data.profile as unknown as { id: string }).id;

  await resetState();
});

/**
 * Zera os dados do módulo para os dois usuários de teste.
 *
 * A suíte cria conversas, mensagens e relações; sem essa limpeza, uma segunda
 * execução herda o estado da anterior e as asserções de contagem passam a
 * depender da ordem. É teste de integração — falar com o banco de verdade faz
 * parte — então a limpeza é feita aqui, direto pelo Prisma.
 */
async function resetState() {
  const { prisma } = await import('../../backend/src/config/prisma');

  // As conversas caem por cascade (members e messages).
  await prisma.chatConversation.deleteMany({
    where: { members: { some: { userId: { in: [ids.alice, ids.bob] } } } },
  });
  await prisma.follow.deleteMany({
    where: { OR: [{ followerId: { in: [ids.alice, ids.bob] } }, { followingId: { in: [ids.alice, ids.bob] } }] },
  });
  // Deixa as bios no estado inicial, para o teste de bio não depender do anterior.
  await prisma.user.updateMany({
    where: { id: { in: [ids.alice, ids.bob] } },
    data: { bio: null, chatPublicKey: null },
  });
}
caso('o número de 15h é emitido, formatado e estável na janela', async () => {
  const res = await alice.get('/chat/number');
  assert.equal(res.status, 200);

  const n = res.data.number as unknown as {
    code: string; formatted: string; windowHours: number; expiresInSeconds: number;
  };
  assert.match(n.code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
  assert.equal(n.formatted, `${n.code.slice(0, 4)}-${n.code.slice(4)}`);
  assert.equal(n.windowHours, 15);
  // Dentro da janela, nunca mais que 15h.
  assert.ok(n.expiresInSeconds > 0 && n.expiresInSeconds <= 15 * 3600);

  // Pedir de novo na mesma janela devolve o mesmo código.
  const again = await alice.get('/chat/number');
  assert.equal((again.data.number as unknown as { code: string }).code, n.code);
});

caso('cada usuário tem um número diferente', async () => {
  const a = (await alice.get('/chat/number')).data.number as unknown as { code: string };
  const b = (await bob.get('/chat/number')).data.number as unknown as { code: string };
  assert.notEqual(a.code, b.code);
});

caso('código inválido ou expirado é recusado', async () => {
  // Formato errado cai no 400 do normalizador.
  assert.equal((await alice.post('/chat/conversations/direct', { number: 'ABC' })).status, 400);
  // Caractere ambíguo (0/O/I/L) também é recusado.
  assert.equal((await alice.post('/chat/conversations/direct', { number: 'ABCDO234' })).status, 400);
  // Formato válido e inexistente: 404 genérico (não confirma se o código existiu).
  assert.equal((await alice.post('/chat/conversations/direct', { number: 'ZZZZ-9999' })).status, 404);
});

caso('o código do Bob abre uma DM para o Alice, sem duplicar', async () => {
  const code = ((await bob.get('/chat/number')).data.number as unknown as { code: string }).code;

  const open = await alice.post('/chat/conversations/direct', { number: code });
  assert.equal(open.status, 201);

  const c = open.data.conversation as unknown as { id: string; kind: string; members: unknown[] };
  assert.equal(c.kind, 'DM');
  assert.equal(c.members.length, 2);
  ids.dm = c.id;

  // Reabrir pela mesma pessoa devolve a MESMA conversa.
  const again = await alice.post('/chat/conversations/direct', { number: code });
  assert.equal((again.data.conversation as unknown as { id: string }).id, ids.dm);

  // E a conversa aparece para os dois lados.
  assert.ok((await conversations(alice)).includes(ids.dm));
  assert.ok((await conversations(bob)).includes(ids.dm));
});

caso('não dá para abrir conversa consigo mesmo pelo próprio código', async () => {
  const code = ((await alice.get('/chat/number')).data.number as unknown as { code: string }).code;
  assert.equal((await alice.post('/chat/conversations/direct', { number: code })).status, 400);
});
caso('perfil expõe bio, contadores e o estado do botão', async () => {
  const res = await alice.get('/chat/profiles/bob');
  assert.equal(res.status, 200);

  const p = res.data.profile as unknown as {
    username: string; followersCount: number; followingCount: number; isFollowing: boolean; isSelf: boolean;
  };
  assert.equal(p.username, 'bob');
  assert.equal(p.isSelf, false);
  assert.equal(typeof p.followersCount, 'number');
  assert.equal(p.isFollowing, false);
});

caso('seguir é idempotente e o contador acompanha', async () => {
  const read = async () => (await bob.get('/chat/profiles/alice')).data.profile as unknown as {
    followersCount: number; isFollowing: boolean;
  };

  const antes = await read();
  assert.equal(antes.isFollowing, false);

  assert.equal((await bob.post('/chat/profiles/alice/follow')).status, 200);
  const depois = await read();
  assert.equal(depois.isFollowing, true);
  assert.equal(depois.followersCount, antes.followersCount + 1);

  // Seguir de novo não infla o contador.
  await bob.post('/chat/profiles/alice/follow');
  assert.equal((await read()).followersCount, depois.followersCount);

  assert.equal((await bob.del('/chat/profiles/alice/follow')).status, 200);
  assert.equal((await read()).isFollowing, false);
});

caso('não é possível seguir a si mesmo', async () => {
  assert.equal((await alice.post('/chat/profiles/alice/follow')).status, 400);
});

caso('listas de seguidores/seguindo batem com o perfil', async () => {
  await bob.post('/chat/profiles/alice/follow');

  const f = (await alice.get('/chat/profiles/alice/relations?list=followers')).data.list as unknown as { username: string }[];
  const g = (await alice.get('/chat/profiles/alice/relations?list=following')).data.list as unknown as { username: string }[];

  assert.ok(f.some((u) => u.username === 'bob'), 'bob deveria seguir alice');
  assert.equal(g.some((u) => u.username === 'bob'), false, 'alice não segue bob');

  await bob.del('/chat/profiles/alice/follow');
});

caso('a bio é salva, volta no perfil e o vazio limpa o campo', async () => {
  const texto = 'Bio de teste — atualizada agora.';
  assert.equal((await bob.put('/chat/bio', { bio: texto })).status, 200);

  const lido = (await alice.get('/chat/profiles/bob')).data.profile as unknown as { bio: string };
  assert.equal(lido.bio, texto);

  // Espaços contam como vazio → limpa.
  await bob.put('/chat/bio', { bio: '   ' });
  const limpo = (await alice.get('/chat/profiles/bob')).data.profile as unknown as { bio: string | null };
  assert.equal(limpo.bio, null);
});

caso('bio acima do limite é recusada pelo validador', async () => {
  assert.equal((await bob.put('/chat/bio', { bio: 'x'.repeat(281) })).status, 400);
});

caso('a busca do diretório encontra pelo nome', async () => {
  const list = (await alice.get('/chat/profiles?search=bob')).data.profiles as unknown as { username: string }[];
  assert.ok(list.some((p) => p.username === 'bob'));
});
caso('grupo aceita @usuario e código, sem duplicar o convidado repetido', async () => {
  const code = ((await bob.get('/chat/number')).data.number as unknown as { code: string }).code;

  const res = await alice.post('/chat/conversations/group', {
    name: 'Equipe',
    invitees: ['bob', code], // mesma pessoa por dois caminhos
  });
  assert.equal(res.status, 201);

  const g = res.data.conversation as unknown as { id: string; kind: string; name: string; members: unknown[] };
  assert.equal(g.kind, 'GROUP');
  assert.equal(g.name, 'Equipe');
  assert.equal(g.members.length, 2); // alice + bob, uma vez só
  ids.group = g.id;
});

caso('grupo sem convidados ou com convidado inexistente é recusado', async () => {
  // Sem ninguém para convidar.
  assert.equal((await alice.post('/chat/conversations/group', { name: 'Vazio', invitees: [] })).status, 400);
  // Item que não é @usuário válido nem código de 8 caracteres: o normalizador
  // do número recusa com 400.
  assert.equal((await alice.post('/chat/conversations/group', { name: 'X', invitees: ['curto'] })).status, 400);
});

caso('a chave pública E2EE é registrada e aparece no perfil', async () => {
  const spki = `B${'k'.repeat(86)}`;
  assert.equal((await alice.put('/chat/key', { publicKey: spki })).status, 200);

  const perfil = (await bob.get('/chat/profiles/alice')).data.profile as unknown as { publicKey: string };
  assert.equal(perfil.publicKey, spki);
});

caso('a chave pública é validada no formato', async () => {
  assert.equal((await alice.put('/chat/key', { publicKey: 'curta' })).status, 400);
});

caso('envia mensagem cifrada e entrega o envelope para os dois lados', async () => {
  const res = await alice.post(`/chat/conversations/${ids.dm}/messages`, {
    clientId: '11111111-1111-4111-8111-111111111111',
    kind: 'TEXT',
    envelope: fakeEnvelope([ids.alice, ids.bob]),
  });
  assert.equal(res.status, 201);

  const list = (await bob.get(`/chat/conversations/${ids.dm}/messages`)).data.messages as unknown as {
    id: string; kind: string; envelope: { copies: Record<string, unknown> }; mine: boolean;
  }[];
  assert.equal(list.length, 1);
  assert.equal(list[0].mine, false, 'para o Bob a mensagem não é dele');
  assert.ok(list[0].envelope.copies[ids.alice], 'precisa haver cópia cifrada para o remetente');
  assert.ok(list[0].envelope.copies[ids.bob], 'e uma para o destinatário');
});

caso('reenviar o mesmo clientId não duplica a mensagem', async () => {
  const antes = ((await alice.get(`/chat/conversations/${ids.dm}/messages`)).data.messages as unknown as unknown[]).length;

  await alice.post(`/chat/conversations/${ids.dm}/messages`, {
    clientId: '11111111-1111-4111-8111-111111111111', // o mesmo de antes
    kind: 'TEXT',
    envelope: fakeEnvelope([ids.alice, ids.bob]),
  });

  const depois = ((await alice.get(`/chat/conversations/${ids.dm}/messages`)).data.messages as unknown as unknown[]).length;
  assert.equal(depois, antes);
});

caso('envelope sem cópia para um participante é recusado', async () => {
  const res = await alice.post(`/chat/conversations/${ids.dm}/messages`, {
    kind: 'TEXT',
    envelope: fakeEnvelope([ids.alice]), // falta o Bob
  });
  assert.equal(res.status, 400);
});

caso('mídia cifrada guarda só os metadados de exibição', async () => {
  const res = await alice.post(`/chat/conversations/${ids.dm}/messages`, {
    kind: 'IMAGE',
    envelope: fakeEnvelope([ids.alice, ids.bob]),
    meta: { mime: 'image/jpeg', bytes: 12_345, width: 800, height: 600 },
  });
  assert.equal(res.status, 201);

  const list = (await bob.get(`/chat/conversations/${ids.dm}/messages`)).data.messages as unknown as {
    kind: string; meta: { mime: string; width: number; bytes: number };
  }[];
  const ultima = list.at(-1)!;
  assert.equal(ultima.kind, 'IMAGE');
  assert.equal(ultima.meta.mime, 'image/jpeg');
  assert.equal(ultima.meta.width, 800);
});

caso('envelope acima do limite é recusado', async () => {
  const grande = {
    epk: 'B'.repeat(88),
    copies: { [ids.alice]: { iv: 'C'.repeat(16), ct: 'A'.repeat(400_001) } },
  };
  assert.equal((await alice.post(`/chat/conversations/${ids.dm}/messages`, {
    kind: 'TEXT', envelope: grande,
  })).status, 400); // barrado pelo zod (ct acima do teto)
});

caso('marcar como lida responde ok', async () => {
  assert.equal((await bob.post(`/chat/conversations/${ids.dm}/read`)).status, 200);
});

caso('quem não participa não consegue ler nem escrever na conversa', async () => {
  // Conversa inexistente: o bloqueio de membro responde 403, não 404 — não
  // entregamos informação sobre o que existe no banco.
  const fantasma = '00000000-0000-4000-8000-000000000000';
  assert.equal((await bob.get(`/chat/conversations/${fantasma}/messages`)).status, 403);
  assert.equal((await bob.post(`/chat/conversations/${fantasma}/messages`, {
    kind: 'TEXT', envelope: fakeEnvelope([ids.bob]),
  })).status, 403);
});

caso('sair do grupo remove a participação e corta o acesso', async () => {
  assert.equal((await bob.del(`/chat/conversations/${ids.group}/members`)).status, 200);
  assert.equal((await bob.get(`/chat/conversations/${ids.group}/messages`)).status, 403);
});

caso('não dá para sair de uma conversa direta', async () => {
  assert.equal((await bob.del(`/chat/conversations/${ids.dm}/members`)).status, 400);
});
