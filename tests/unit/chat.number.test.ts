import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NUMBER_WINDOW_MS,
  deriveNumber,
  formatNumber,
  normalizeNumber,
  windowEndsAt,
  windowIndex,
} from '../../backend/src/services/chat/number.service';

// A janela é de 15h, ancorada na época (epoch), como no TOTP.
const WINDOW = NUMBER_WINDOW_MS;
const at = (h: number) => new Date(Date.UTC(2026, 9, 4, h));

test('a janela dura 15 horas', () => {
  assert.equal(NUMBER_WINDOW_MS, 15 * 60 * 60 * 1000);
  assert.equal(windowEndsAt(at(0)).getTime() - at(0).getTime(), WINDOW);
});

test('o índice da janela avança de 15 em 15 horas', () => {
  const inicio = windowIndex(at(0));
  assert.equal(windowIndex(at(14)), inicio);
  assert.equal(windowIndex(at(15)), inicio + 1);
  assert.equal(windowIndex(at(30)), inicio + 2);
});

test('o fim da janela é sempre o próximo múltiplo de 15h', () => {
  // 10h dentro da janela: faltam 5h.
  assert.equal(windowEndsAt(at(10)).getTime(), at(15).getTime());
});

test('o código é determinístico dentro da mesma janela', () => {
  const a = deriveNumber('user-a', 100);
  const b = deriveNumber('user-a', 100);
  assert.equal(a, b);
  assert.equal(a.length, 8);
});

test('o código muda quando a janela de 15h vira', () => {
  const antes = deriveNumber('user-a', 100);
  const depois = deriveNumber('user-a', 101);
  assert.notEqual(antes, depois);
});

test('usuários diferentes recebem códigos diferentes', () => {
  const codes = new Set(['a', 'b', 'c', 'd'].map((u) => deriveNumber(u, 100)));
  assert.equal(codes.size, 4);
});

test('o código usa só caracteres ditáveis ao telefone', () => {
  // Sem 0/O/1/I/L: o código é lido em voz alta sem ambiguidade.
  for (let i = 0; i < 200; i++) {
    assert.match(deriveNumber(`user-${i}`, i), /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
  }
});

test('a formatação separa em dois blocos de 4', () => {
  assert.equal(formatNumber('ABCD2345'), 'ABCD-2345');
});

test('normaliza o que a pessoa digitar', () => {
  assert.equal(normalizeNumber('abcd-2345'), 'ABCD2345');
  assert.equal(normalizeNumber('ABCD 2345'), 'ABCD2345');
  assert.equal(normalizeNumber(' abcd2345 '), 'ABCD2345');
  assert.equal(normalizeNumber('Ab-Cd-23-45'), 'ABCD2345');
});

test('recusa código com tamanho errado ou caractere ambíguo', () => {
  assert.throws(() => normalizeNumber('ABCD234'), /8 caracteres/);
  assert.throws(() => normalizeNumber('ABCD23455'), /8 caracteres/);
  // O, I, L e 0 não existem no alfabeto — evita confusão na ditagem.
  assert.throws(() => normalizeNumber('ABCD0234'), /inválido/);
  assert.throws(() => normalizeNumber('ABCDO234'), /inválido/);
  assert.throws(() => normalizeNumber('ABCDI234'), /inválido/);
  assert.throws(() => normalizeNumber('ABCDL234'), /inválido/);
  // Mas o E existe — o alfabeto é Crockford, não "sem vogais".
  assert.equal(normalizeNumber('ABCDE234'), 'ABCDE234');
});