/**
 * Login de apoio para os testes de integração.
 *
 * O hub exige 2FA no primeiro acesso, então um login simples não basta: este
 * helper faz a sessão completa (setup → confirm → verify) com `otplib`, a
 * mesma biblioteca que o backend usa para validar o código.
 *
 * Uso: `npx tsx tests/integration/login.ts <usuario> <senha>`
 * Imprime o JSON da resposta de `/api/chat/number` — ou o erro, se faltar
 * algum passo.
 */
import { authenticator } from 'otplib';

const BASE = process.env.API_URL ?? 'http://localhost:8080/api';
const ORIGIN = 'http://localhost:5173';

const [username, password] = process.argv.slice(2);
if (!username || !password) {
  console.error('Uso: tsx login.ts <usuario> <senha>');
  process.exit(1);
}

const cookies = new Map<string, string>();

const jar = () => [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');

async function call(method: string, path: string, body?: unknown) {
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
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${JSON.stringify(data)}`);
  return data as Record<string, never>;
}

/**
 * `authenticator` gera e valida no mesmo formato (base32), então o segredo
 * devolvido pelo setup vai direto — sem converter para hex.
 */
const totp = (secretB32: string) => authenticator.generate(secretB32);

async function main() {
  const login = await call('POST', '/auth/login', { username, password });
  const step = (login as unknown as { step: string }).step;
  console.log('login:', step);

  // Primeiro acesso: configura o 2FA. O `confirm` já conclui o login, emitindo
  // o cookie de sessão — não existe um `verify` para chamar em seguida.
  if (step === 'SETUP_2FA') {
    const setup = await call('POST', '/auth/2fa/setup', {});
    const secret = (setup as unknown as { secret: string }).secret;
    await call('POST', '/auth/2fa/confirm', { code: totp(secret) });
    console.log('2FA configurado e sessão emitida');
  } else if (step === 'VERIFY_2FA') {
    // Acesso seguinte: o segredo está criptografado (AES-256-GCM) no banco, e
    // o servidor não devolve a chave por nenhum endpoint. Por isso este script
    // informa o segredo via TEST_TOTP_SECRET_<usuário> ou imprime o passo e
    // deixa a sessão por conta de quem chamou.
    const secret = process.env[`TEST_TOTP_SECRET_${username.toUpperCase()}`];
    if (!secret) {
      console.log('PASSO=VERIFY_2FA (informe TEST_TOTP_SECRET_' + username.toUpperCase() + ' para concluir)');
      return;
    }
    await call('POST', '/auth/2fa/verify', { code: totp(secret) });
    console.log('2FA verificado');
  }

  const me = await call('GET', '/auth/me');
  console.log('me:', JSON.stringify(me));

  const number = await call('GET', '/chat/number');
  console.log('number:', JSON.stringify(number));
}

main().catch((e) => {
  console.error('FALHOU:', (e as Error).message);
  process.exit(1);
});