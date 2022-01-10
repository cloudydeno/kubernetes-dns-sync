import { assertEquals } from "https://deno.land/std@0.115.0/testing/asserts.ts";
import { readTxtValue } from "./util.ts";

Deno.test('txt 1', () => {
  assertEquals(readTxtValue('hello world'), 'helloworld');
});

Deno.test('txt 2', () => {
  assertEquals(readTxtValue('"hello world"'), 'hello world');
});

Deno.test('txt 3', () => {
  assertEquals(readTxtValue('"he\\\\llo wor\\"ld"'), 'he\\llo wor"ld');
});

Deno.test('txt 4', () => {
  assertEquals(readTxtValue('"hello world th" "is message is" " long"'), 'hello world this message is long');
});
