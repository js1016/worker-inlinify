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

const workerInlinify = {
    contextPath: path.resolve(__dirname),

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
        let workerRefs: WorkerRefs[] = this.findWorkerRefs(source);
        if (workerRefs.length === 0) {
            return source;
        }
        let result: string = '';
        let replaceNodes: ReplaceNode[] = [];
        workerRefs.forEach(workerRef => {
            let worker = path.join(this.contextPath, workerRef.worker);
            if (fs.existsSync(worker)) {
                workerRef.script = fs.readFileSync(worker).toString();
                workerRef.varname = getWorkerVarName(source);
                workerRef.refs.forEach(ref => {
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
                result += source.substr(0, node.start);
            } else {
                result += source.substring(replaceNodes[index - 1].end, node.start);
            }
            result += 'window.URL.createObjectURL(';
            if (node.workerRef.refs.length > 1) {
                result += node.workerRef.varname;
            } else {
                result += 'new Blob(["' + text2jsvar.convert(node.workerRef.script) + '"])';
            }
            result += ')';
            if (index === replaceNodes.length - 1) {
                result += source.substring(node.end);
            }
        });
        workerRefs.forEach(workerRef => {
            if (workerRef.script && workerRef.refs.length > 1) {
                result = `var ${workerRef.varname}=new Blob(["${text2jsvar.convert(workerRef.script)}"]);\r\n` + result;
            }
        });
        return result;
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

