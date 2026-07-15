module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    // Down-level ES private class fields/methods (`this.#field`). The Expo Go on
    // this device runs an older Hermes that throws "private properties are not
    // supported"; Metro runs Babel over node_modules, so this strips the syntax
    // from RN core too. Runs before the preset's worklets plugin, preserving its
    // "must be last" requirement.
    plugins: [
      '@babel/plugin-transform-private-methods',
      '@babel/plugin-transform-class-properties',
      '@babel/plugin-transform-private-property-in-object',
    ],
  };
};
