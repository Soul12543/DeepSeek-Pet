'use strict';
const fs=require('node:fs'),path=require('node:path'),esbuild=require('esbuild');
const out=path.join(__dirname,'../onefish-desktop/vendor/socket.io-client');fs.mkdirSync(out,{recursive:true});
esbuild.buildSync({stdin:{contents:'module.exports = require("socket.io-client");',resolveDir:__dirname},bundle:true,platform:'node',target:'node20',format:'cjs',outfile:path.join(out,'client.cjs'),external:['bufferutil','utf-8-validate'],legalComments:'inline',minify:true});
let licenses='Socket.IO client and bundled dependencies\n\n';
for(const pkg of ['socket.io-client','socket.io-parser','engine.io-client','engine.io-parser','@socket.io/component-emitter','debug','ms','ws','xmlhttprequest-ssl']){
 const root=path.join(__dirname,'node_modules',pkg),meta=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
 const name=fs.readdirSync(root).find(n=>/^licen[sc]e/i.test(n));licenses+='\n--- '+pkg+' '+meta.version+' ---\n'+(name?fs.readFileSync(path.join(root,name),'utf8'):'License: '+meta.license)+'\n';
}
fs.writeFileSync(path.join(out,'LICENSES.txt'),licenses);console.log('Bundled desktop network client');

esbuild.buildSync({entryPoints:[path.join(__dirname,'server.cjs')],bundle:true,platform:'node',target:'node22',format:'cjs',outfile:path.join(__dirname,'server.bundle.cjs'),external:['bufferutil','utf-8-validate'],legalComments:'inline',minify:true});
console.log('Bundled standalone poker server');
