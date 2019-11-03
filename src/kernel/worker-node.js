// We use this file to make workers work very easily with Typescript
const path = require('path');
 
require('ts-node').register();
require(path.resolve(__dirname, './worker-node.ts'));
