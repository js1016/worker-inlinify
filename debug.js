const fs = require('fs');
const workerInlinify = require('./worker-inlinify');
const path = require('path');

let source = fs.readFileSync('test/samples/sample1.js').toString();
workerInlinify.contextPath = 'test/samples';
let result = workerInlinify.inlinify(source);
debugger;
console.log(result);