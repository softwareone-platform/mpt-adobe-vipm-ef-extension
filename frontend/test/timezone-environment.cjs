// Lets a test change the browser's time zone with `setTimeZone`.
// Jest gives each test file its own copy of `process.env`, so setting
// `process.env.TZ` in a test does nothing. The change lasts for the rest of
// the file, so put the original zone back after each test.
const { TestEnvironment } = require('jest-environment-jsdom');

module.exports = class TimeZoneEnvironment extends TestEnvironment {
  constructor(config, context) {
    super(config, context);
    this.global.setTimeZone = (timeZone) => {
      if (timeZone === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = timeZone;
      }
    };
  }
};
