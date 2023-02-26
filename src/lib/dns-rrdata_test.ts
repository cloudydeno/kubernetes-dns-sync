import { assertEquals } from "https://deno.land/std@0.177.0/testing/asserts.ts";

import { readTxtValue } from "./dns-rrdata.ts";

Deno.test('rrdata: txt 1', () => {
  assertEquals(readTxtValue('hello world'), 'helloworld');
});

Deno.test('rrdata: txt 2', () => {
  assertEquals(readTxtValue('"hello world"'), 'hello world');
});

Deno.test('rrdata: txt 3', () => {
  assertEquals(readTxtValue('"he\\\\llo wor\\"ld"'), 'he\\llo wor"ld');
});

Deno.test('rrdata: txt 4', () => {
  assertEquals(readTxtValue('"hello world th" "is message is" " long"'), 'hello world this message is long');
});
