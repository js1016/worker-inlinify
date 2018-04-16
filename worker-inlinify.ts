import * as acorn from 'acorn';
import * as acornLoose from 'acorn/dist/acorn_loose';
import * as walk from 'acorn/dist/walk';
import * as path from 'path';
import * as fs from 'fs';
import * as text2jsvar from 'text2jsvar';

class RefPosition {
    public start: number;
    public end: number;
    constructor(start: number, end: number) {
        this.start = start;
        this.end = end;
    }
}

class WorkerRefs {
    public worker: string;
    public refs: RefPosition[];
    public script: string;
    public varname: string;
    constructor(worker: string, start: number, end: number) {
        this.worker = worker;
        this.refs = [];
        this.addRef(start, end);
    }
    addRef(start: number, end: number) {
        this.refs.push(new RefPosition(start, end));
    }
}

class ReplaceNode {
    public start: number;
    public end: number;
    public workerRef: WorkerRefs;
    constructor(start: number, end: number, workerRef: WorkerRefs) {
        this.start = start;
        this.end = end;
        this.workerRef = workerRef;
    }
}

class EvalReplaceNode {
    public start: number;
    public end: number;
    public replacement: string;
    constructor(start: number, end: number, replacement: string) {
        this.start = start;
        this.end = end;
        this.replacement = text2jsvar.convert(replacement);
    }
}

const workerInlinify = {
    _webpackAssets: null,

    contextPath: path.resolve(process.cwd()),

    useLoose: false,

    findWorkerRefs: function (source: string): WorkerRefs[] {
        let ast = this.useLoose ? acornLoose.parse_dammit(source) : acorn.parse(source);
        let arr: WorkerRefs[] = [];
        let jsFileRegExp: RegExp = /^([^\?]+\.js)(\?.*)?$/i;
        let workerMap = {};
        walk.simple(ast, {
            Expression(node) {
                if (node.type === 'NewExpression' && node.callee.name === 'Worker') {
                    if (node.arguments.length > 0) {
                        let argNode = node.arguments[0];
                        let leftLiteralNode = findLeftLiteralNode(argNode);
                        if (leftLiteralNode && typeof leftLiteralNode.value === 'string') {
                            let matchResult = jsFileRegExp.exec(leftLiteralNode.value);
                            if (matchResult) {
                                let worker = matchResult[1];
                                if (workerMap[worker] !== undefined) {
                                    arr[workerMap[worker]].addRef(argNode.start, argNode.end);
                                } else {
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

    inlinify: function (source: string): string {
        // start inlinify contents in eval
        let ast = this.useLoose ? acornLoose.parse_dammit(source) : acorn.parse(source);
        let evalReplaceNodes: EvalReplaceNode[] = [];
        let newSource = '';
        walk.simple(ast, {
            Expression(node) {
                if (node.type === 'CallExpression' && node.callee.name === 'eval' && node.arguments.length > 0 && node.arguments[0].type === 'Literal') {
                    let argument = node.arguments[0];
                    let result = workerInlinify.inlinify(argument.value);
                    if (result !== argument.value) {
                        evalReplaceNodes.push(new EvalReplaceNode(argument.start + 1, argument.end - 1, result));
                    }
                }
            }
        });
        // replace eval contents if needed
        evalReplaceNodes.forEach((node, index) => {
            if (index === 0) {
                newSource += source.substr(0, node.start);
            } else {
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
        let workerRefs: WorkerRefs[] = this.findWorkerRefs(source);
        if (workerRefs.length === 0) {
            return source;
        }
        newSource = '';
        let replaceNodes: ReplaceNode[] = [];
        workerRefs.forEach(workerRef => {
            let worker = path.join(this.contextPath, workerRef.worker);
            if (workerInlinify._webpackAssets !== null) {
                // find the worker script in webpack assets
                if (workerRef.worker in workerInlinify._webpackAssets) {
                    workerRef.script = workerInlinify._webpackAssets[workerRef.worker].source();
                }
            } else if (fs.existsSync(worker)) {
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
        replaceNodes.sort((a, b) => {
            if (a.start > b.start) {
                return 1;
            }
        });
        replaceNodes.forEach((node, index) => {
            if (index === 0) {
                newSource += source.substr(0, node.start);
            } else {
                newSource += source.substring(replaceNodes[index - 1].end, node.start);
            }
            newSource += 'window.URL.createObjectURL(';
            if (node.workerRef.refs.length > 1) {
                newSource += node.workerRef.varname;
            } else {
                newSource += 'new Blob(["' + text2jsvar.convert(node.workerRef.script) + '"])';
            }
            newSource += ')';
            if (index === replaceNodes.length - 1) {
                newSource += source.substring(node.end);
            }
        });
        workerRefs.forEach(workerRef => {
            if (workerRef.script && workerRef.refs.length > 1) {
                newSource = `var ${workerRef.varname}=new Blob(["${text2jsvar.convert(workerRef.script)}"]);\r\n` + newSource;
            }
        });
        return newSource;
    },

    inlinifyFile: function (file: string): void {
        let filePath = path.join(this.contextPath, file);
        let extname = path.extname(filePath).toLowerCase();
        if (extname === '.js' && fs.existsSync(filePath)) {
            let source = fs.readFileSync(filePath).toString();
            let inlinifyResult = this.inlinify(source);
            if (source !== inlinifyResult) {
                fs.writeFileSync(filePath, inlinifyResult);
            }
        }
    }
}

function getWorkerVarName(source: string) {
    const prefix = 'inlineWorker_';
    let varname = prefix + getUniqueString();
    while (source.indexOf(varname) > -1) {
        varname = prefix + getUniqueString();
    }
    return varname;
    function getUniqueString() {
        return Math.random().toString(36).substring(7);
    }
}

function findLeftLiteralNode(node) {
    let lastNode = node;
    while (lastNode.type === 'BinaryExpression') {
        lastNode = lastNode.left;
    }
    if (lastNode.type === 'Literal') {
        return lastNode;
    } else {
        return null;
    }
}

export = workerInlinify;