
const workerInlinify = require('../worker-inlinify');
const fs = require('fs');
const assert = require('assert');
const path = require('path');
const acorn = require('acorn');

let samplePath = path.resolve('test/samples');
workerInlinify.contextPath = samplePath;
let dirs = fs.readdirSync(samplePath);

test(0);

function test(index) {
    let fileName = dirs[index];
    let next = index + 1;
    let sampleFileReg = /^sample\d+\.js$/

    if (!sampleFileReg.test(fileName)) {
        if (next < dirs.length) {
            test(next);
        }
        return;
    }
    let answerFileName = path.parse(fileName).name + '.json';
    describe(`Testing sample: ${dirs[index]}`, () => {
        let source = fs.readFileSync(path.join(samplePath, fileName)).toString();
        let answer = require(path.join(samplePath, answerFileName));
        it('Testing "findWorkerRefs" method', () => {
            let result = JSON.parse(JSON.stringify(workerInlinify.findWorkerRefs(source)));
            assert.deepStrictEqual(result, answer.workerRefs, 'Result does not match!');
        });
        let result = workerInlinify.inlinify(source);
        it('Testing "inlinify" method', () => {
            let ast = acorn.parse(result);
            assert.doesNotThrow(() => {
                acorn.parse(result);
            }, SyntaxError, 'Inlinify result has Syntax Error!');
        });
        if (answer.output) {
            it('Testing "inlinify" output', () => {
                assert(result === answer.output, 'Inlinify result is incorrect');
            });
        }
        after(() => {
            if (next < dirs.length) {
                test(next);
            }
        });
    });
}