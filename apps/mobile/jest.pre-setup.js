'use strict';

// expo/src/winter/runtime.native installs lazy getters (structuredClone,
// TextDecoder, URL, __ExpoImportMetaRegistry…) on the global via installGlobal.ts.
// When those getters fire during test execution they call require() from outside
// Jest's module scope and throw "import outside test scope".
//
// Fix: replace every lazy getter with a concrete value using Node's native
// built-ins — accessed via `require()` so we never trigger the lazy getter.
// This runs in setupFiles, which appends AFTER the jest-expo preset's setup.js
// that called require('expo/src/winter') and installed the lazy getters.

const { TextDecoder: NodeTextDecoder } = require('node:util');
const { URL: NodeURL, URLSearchParams: NodeURLSearchParams } = require('node:url');

// Simple polyfill for structuredClone — Node 17+ has it natively but accessing
// the bare identifier would trigger the Expo lazy getter.
function safeStructuredClone(val) {
  return JSON.parse(JSON.stringify(val));
}

const replacements = {
  TextDecoder: NodeTextDecoder,
  TextDecoderStream: undefined,
  TextEncoderStream: undefined,
  URL: NodeURL,
  URLSearchParams: NodeURLSearchParams,
  structuredClone: safeStructuredClone,
  __ExpoImportMetaRegistry: undefined,
  DOMException: typeof DOMException !== 'undefined' ? DOMException : Error,
  fetch: typeof fetch !== 'undefined' ? fetch : undefined,
  Headers: typeof Headers !== 'undefined' ? Headers : undefined,
  Request: typeof Request !== 'undefined' ? Request : undefined,
  Response: typeof Response !== 'undefined' ? Response : undefined,
};

for (const [name, value] of Object.entries(replacements)) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  // Only replace if there is a lazy getter (not an already-materialized value)
  if (descriptor && typeof descriptor.get === 'function') {
    Object.defineProperty(globalThis, name, {
      value,
      configurable: true,
      writable: true,
      enumerable: true,
    });
  }
}
