#!/usr/bin/env node
const fs = require('fs');
const workerInlinify = require('../worker-inlinify');
const path = require('path');
const files = fs.readdirSync(process.cwd());

process.argv.forEach(arg => {
    switch (arg.toLowerCase()) {
        case '--loose':
            workerInlinify.useLoose = true;
            break;
    }
});

files.forEach(file => {
    workerInlinify.inlinifyFile(file);
});