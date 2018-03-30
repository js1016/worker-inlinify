var a = new Worker('worker.js');
var b = function () {
    return new Worker('worker.js');
}
var c = new Worker('non-existing-worker.js');
var d = new Worker('worker2.js');