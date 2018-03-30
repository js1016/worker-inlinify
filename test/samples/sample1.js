var a = new Worker('worker.js');
var c = new Worker('w' + 'o' + 'r' + 'k' + 'e' + 'r.js');
var d = new Worker(1);
var b = new Worker('worker.js?i=' + new Date().getTime() + '&v=latest');
var e = new Worker(undefined);
var f = new Worker();
var g = new Worker(true);
var h = new Worker(window.workerName);
var i = new Woker2('worker.js');
