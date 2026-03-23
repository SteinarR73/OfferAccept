// Stub all lucide-react icon components to null-rendering functions.
// This allows pure-logic unit tests to call functions that embed JSX icons
// without requiring a full React rendering environment.
export default new Proxy(
  {},
  { get: (_target, name) => () => null },
);

module.exports = new Proxy(
  {},
  { get: (_target, name) => () => null },
);
