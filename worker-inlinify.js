"use strict";
var acorn = require("acorn");
var acornLoose = require("acorn/dist/acorn_loose");
var walk = require("acorn/dist/walk");
var path = require("path");
var fs = require("fs");
var text2jsvar = require("text2jsvar");
var RefPosition = /** @class */ (function () {
    function RefPosition(start, end) {
        this.start = start;
        this.end = end;
    }
    return RefPosition;
}());
var WorkerRefs = /** @class */ (function () {
    function WorkerRefs(worker, start, end) {
        this.worker = worker;
        this.refs = [];
        this.addRef(start, end);
    }
    WorkerRefs.prototype.addRef = function (start, end) {
        this.refs.push(new RefPosition(start, end));
    };
    return WorkerRefs;
}());
var ReplaceNode = /** @class */ (function () {
    function ReplaceNode(start, end, workerRef) {
        this.start = start;
        this.end = end;
        this.workerRef = workerRef;
    }
    return ReplaceNode;
}());
var EvalReplaceNode = /** @class */ (function () {
    function EvalReplaceNode(start, end, replacement) {
        this.start = start;
        this.end = end;
        this.replacement = text2jsvar.convert(replacement);
    }
    return EvalReplaceNode;
}());
var workerInlinify = {
    _webpackAssets: null,
    contextPath: path.resolve(process.cwd()),
    useLoose: false,
    findWorkerRefs: function (source) {
        var ast = this.useLoose ? acornLoose.parse_dammit(source) : acorn.parse(source);
        var arr = [];
        var jsFileRegExp = /^([^\?]+\.js)(\?.*)?$/i;
        var workerMap = {};
        walk.simple(ast, {
            Expression: function (node) {
                if (node.type === 'NewExpression' && node.callee.name === 'Worker') {
                    if (node.arguments.length > 0) {
                        var argNode = node.arguments[0];
                        var leftLiteralNode = findLeftLiteralNode(argNode);
                        if (leftLiteralNode && typeof leftLiteralNode.value === 'string') {
                            var matchResult = jsFileRegExp.exec(leftLiteralNode.value);
                            if (matchResult) {
                                var worker = matchResult[1];
                                if (workerMap[worker] !== undefined) {
                                    arr[workerMap[worker]].addRef(argNode.start, argNode.end);
                                }
                                else {
                                    arr.push(new WorkerRefs(worker, argNode.start, argNode.end));
                                    workerMap[worker] = arr.length - 1;
                                }
                            }
                        }
                    }
                }
            }
        });
        return arr;
    },
    inlinify: function (source) {
        var _this = this;
        // start inlinify contents in eval
        var ast = this.useLoose ? acornLoose.parse_dammit(source) : acorn.parse(source);
        var evalReplaceNodes = [];
        var newSource = '';
        walk.simple(ast, {
            Expression: function (node) {
                if (node.type === 'CallExpression' && node.callee.name === 'eval' && node.arguments.length > 0 && node.arguments[0].type === 'Literal') {
                    var argument = node.arguments[0];
                    var result = workerInlinify.inlinify(argument.value);
                    if (result !== argument.value) {
                        evalReplaceNodes.push(new EvalReplaceNode(argument.start + 1, argument.end - 1, result));
                    }
                }
            }
        });
        // replace eval contents if needed
        evalReplaceNodes.forEach(function (node, index) {
            if (index === 0) {
                newSource += source.substr(0, node.start);
            }
            else {
                newSource += source.substring(evalReplaceNodes[index - 1].end, node.start);
            }
            newSource += node.replacement;
            if (index === evalReplaceNodes.length - 1) {
                newSource += source.substring(node.end);
            }
        });
        if (evalReplaceNodes.length > 0) {
            source = newSource;
        }
        // inlinify contents outside eval
        var workerRefs = this.findWorkerRefs(source);
        if (workerRefs.length === 0) {
            return source;
        }
        newSource = '';
        var replaceNodes = [];
        workerRefs.forEach(function (workerRef) {
            var worker = path.join(_this.contextPath, workerRef.worker);
            if (workerInlinify._webpackAssets !== null && workerRef.worker in workerInlinify._webpackAssets) {
                // find the worker script in webpack assets
                workerRef.script = workerInlinify._webpackAssets[workerRef.worker].source();
            }
            else if (fs.existsSync(worker)) {
                // find the resource in file system
                workerRef.script = fs.readFileSync(worker).toString();
            }
            if (workerRef.script !== undefined) {
                workerRef.varname = getWorkerVarName(source);
                workerRef.refs.forEach(function (ref) {
                    replaceNodes.push(new ReplaceNode(ref.start, ref.end, workerRef));
                });
            }
        });
        if (replaceNodes.length === 0) {
            return source;
        }
        replaceNodes.sort(function (a, b) {
            if (a.start > b.start) {
                return 1;
            }
        });
        replaceNodes.forEach(function (node, index) {
            if (index === 0) {
                newSource += source.substr(0, node.start);
            }
            else {
                newSource += source.substring(replaceNodes[index - 1].end, node.start);
            }
            newSource += 'window.URL.createObjectURL(';
            if (node.workerRef.refs.length > 1) {
                newSource += node.workerRef.varname;
            }
            else {
                newSource += 'new Blob(["' + text2jsvar.convert(node.workerRef.script) + '"])';
            }
            newSource += ')';
            if (index === replaceNodes.length - 1) {
                newSource += source.substring(node.end);
            }
        });
        workerRefs.forEach(function (workerRef) {
            if (workerRef.script && workerRef.refs.length > 1) {
                newSource = "var " + workerRef.varname + "=new Blob([\"" + text2jsvar.convert(workerRef.script) + "\"]);\r\n" + newSource;
            }
        });
        return newSource;
    },
    inlinifyFile: function (file) {
        var filePath = path.join(this.contextPath, file);
        var extname = path.extname(filePath).toLowerCase();
        if (extname === '.js' && fs.existsSync(filePath)) {
            var source = fs.readFileSync(filePath).toString();
            var inlinifyResult = this.inlinify(source);
            if (source !== inlinifyResult) {
                fs.writeFileSync(filePath, inlinifyResult);
            }
        }
    }
};
function getWorkerVarName(source) {
    var prefix = 'inlineWorker_';
    var varname = prefix + getUniqueString();
    while (source.indexOf(varname) > -1) {
        varname = prefix + getUniqueString();
    }
    return varname;
    function getUniqueString() {
        return Math.random().toString(36).substring(7);
    }
}
function findLeftLiteralNode(node) {
    var lastNode = node;
    while (lastNode.type === 'BinaryExpression') {
        lastNode = lastNode.left;
    }
    if (lastNode.type === 'Literal') {
        return lastNode;
    }
    else {
        return null;
    }
}
module.exports = workerInlinify;
