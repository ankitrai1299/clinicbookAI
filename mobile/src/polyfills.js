// Web-API globals that React Native's startup (setUpDefaultReactNativeEnvironment)
// and bundled libs expect but the older Hermes in this device's Expo Go does not
// provide. Registered as a Metro POLYFILL (see metro.config.js) so it runs BEFORE
// InitializeCore. ES5 only — polyfills run in a raw global scope.
(function () {
  'use strict';
  var g = typeof global !== 'undefined' ? global : this;

  // DOMException
  if (typeof g.DOMException === 'undefined') {
    var DOMException = function (message, name) {
      Error.call(this, message);
      this.message = message || '';
      this.name = name || 'Error';
      this.code = 0;
    };
    DOMException.prototype = Object.create(Error.prototype);
    DOMException.prototype.constructor = DOMException;
    g.DOMException = DOMException;
  }
})();
