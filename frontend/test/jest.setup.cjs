// jsdom doesn't define TextEncoder/TextDecoder, which react-router v7 requires.
const { TextEncoder, TextDecoder } = require('node:util');

global.TextEncoder = global.TextEncoder ?? TextEncoder;
global.TextDecoder = global.TextDecoder ?? TextDecoder;
