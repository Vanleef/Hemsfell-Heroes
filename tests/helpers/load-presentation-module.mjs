import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const compiled = new Map();

/** Run the shipped module with controlled browser boundaries; no source slicing
 * or test-only exports in the application bundle. Compilation is reused while
 * each test receives isolated module state. */
export function loadPresentationModule(path, globals = {}, imports = {}) {
  const url = new URL(`../../${path}`, import.meta.url);
  if (!compiled.has(path)) {
    const source = readFileSync(url, 'utf8').replaceAll('import.meta.url', JSON.stringify(url.href));
    compiled.set(path, ts.transpileModule(source, {
      fileName: path,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText);
  }
  const exports = {};
  const context = vm.createContext({
    exports, URL, AbortController, DOMException, queueMicrotask, Response, Blob,
    require(name) {
      if (name in imports) return imports[name];
      if (name === 'react') return { memo: (component) => component };
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
      if (name.endsWith('.module.css')) return { default: {} };
      throw new Error(`Unexpected dependency: ${name}`);
    },
    ...globals,
  });
  vm.runInContext(compiled.get(path), context, { filename: path });
  return exports;
}

export const deferred = () => {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
};

// Drain promises without depending on elapsed wall-clock time.
export const flush = () => new Promise((resolve) => setImmediate(resolve));
