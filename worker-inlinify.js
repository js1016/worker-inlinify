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
var workerInlinify = {
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
        var workerRefs = this.findWorkerRefs(source);
        if (workerRefs.length === 0) {
            return source;
        }
        var result = '';
        var replaceNodes = [];
        workerRefs.forEach(function (workerRef) {
            var worker = path.join(_this.contextPath, workerRef.worker);
            if (fs.existsSync(worker)) {
                workerRef.script = fs.readFileSync(worker).toString();
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
                result += source.substr(0, node.start);
            }
            else {
                result += source.substring(replaceNodes[index - 1].end, node.start);
            }
            result += 'window.URL.createObjectURL(';
            if (node.workerRef.refs.length > 1) {
                result += node.workerRef.varname;
            }
            else {
                result += 'new Blob(["' + text2jsvar.convert(node.workerRef.script) + '"])';
            }
            result += ')';
            if (index === replaceNodes.length - 1) {
                result += source.substring(node.end);
            }
        });
        workerRefs.forEach(function (workerRef) {
            if (workerRef.script && workerRef.refs.length > 1) {
                result = "var " + workerRef.varname + "=new Blob([\"" + text2jsvar.convert(workerRef.script) + "\"]);\r\n" + result;
            }
        });
        return result;
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
