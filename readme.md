worker-inlinify
==========
[![NPM version](https://img.shields.io/npm/v/worker-inlinify.svg?style=flat)](https://www.npmjs.com/package/worker-inlinify) [![NPM downloads](http://img.shields.io/npm/dm/worker-inlinify.svg?style=flat)](https://www.npmjs.com/package/worker-inlinify) [![MIT License](http://img.shields.io/badge/license-MIT-blue.svg?style=flat)](LICENSE)

worker-inlinify transforms separate web worker script reference into inline script using syntax: `new Worker(window.URL.createObjectURL(new Blob(["/* Web Worker code here */"])))`.

## Installation
You can install it globally to use the CLI everywhere.
```
npm install worker-inlinify -g
```

Or just install within your project.
```
npm install worker-inlinify --save
```

## Command line interface
__worker-inlinify__ is available as a global command if you installed it globally. It will read all `*.js` files from the current working directory and inlinify any external web worker references like `new Worker("worker.js")` if the external web worker script can be found.

For example, you have following files in the __home__ directory.

1. home/main.js
   ```javascript
   var worker = new Worker('src/worker.js');
   var fakeWorker = new Worker('non-existing-worker.js');
   eval('new Worker("src/worker.js")');
   ```

2. home/src/worker.js
   ```javascript
   (function(){
       console.log('Hi from worker.js');
   })();
   
   ```

After running `worker_inlinify` command in __home__ directory, the __main.js__ will be overwritten to:

```javascript
var worker = new Worker(window.URL.createObjectURL(new Blob(["(function(){\r\n    console.log(\'Hi from worker.js\');\r\n})();"])));
var fakeWorker = new Worker('non-existing-worker.js');
eval('new Worker(window.URL.createObjectURL(new Blob([\"(function(){\\r\\n    console.log(\\\'Hi from worker.js\\\');\\r\\n})();\"])))');
```

If you don't want to install it globally, __worker-inlinify__ is also available from npm scripts, you can define it in a custom script like below in your __package.json__.

```json
{
  "scripts": {
    "inlinify": "worker-inlinify"
  }
}
```

And  `npm run inlinify` will do the same trick.

### --loose
If you have the following code snippet, you would get an error: __SyntaxError: Identifier 'a' has already been declared (3:4)__ when running `worker-inlinify`. This is because __worker-inlinify__ uses [Acorn](https://github.com/acornjs/acorn) as the JavaScript parser to parse your JS code and [Acorn](https://github.com/acornjs/acorn) will raise a `SyntaxError` object when encountering a syntax error. 
```javascript
var worker = new Worker('src/worker.js');
let a = 'a';
let a = 'a';
```
You can use `worker-inlinify --loose` to overcome this, but it is not recommended.

## workerInlinify.inlinify(source)
Description: Inlinify the given source code.

#### Arguments
<table>
    <tr>
        <th>Parameter</th>
        <th>Type</th>
        <th>Description</th>
    </tr>
    <tr>
        <td>source</td>
        <td>String</td>
        <td>The source string to be inlinified.</td>
    </tr>
</table>

#### Return value
The inlinified script.

## workerInlinify.inlinifyFile(file)
Description: Inlinify the given JS file, the file must have a "js" extension name.

#### Arguments
<table>
    <tr>
        <th>Parameter</th>
        <th>Type</th>
        <th>Description</th>
    </tr>
    <tr>
        <td>file</td>
        <td>String</td>
        <td>The JS file path to be inlinified</td>
    </tr>
</table>

#### Return value
No return value, the JS file will be overwritten with the inlinified result.

## workerInlinify.contextPath
Description: The path where workerInlinify finds the external web worker scripts.
#### Type: String
#### Defautl value: `process.cwd()`
The default contextPath is the current node working directory. You can set to a custom path where workerInlinify can find the external web worker scripts.

## workerInlinify.useLoose
Description: Whether to use an error-tolerant parser.
#### Type: Boolean
#### Default value: false
The default value is false. If you encounter a `SyntaxError` when inlinifying the script, you may either fix the Syntax error in your script or set this value to true to solve it.