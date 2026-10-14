'use strict';
// Server/web build only. Never writes the desktop client or installation packages.
const fs=require('node:fs'),path=require('node:path'),esbuild=require('esbuild');
const web=path.join(__dirname,'web');fs.mkdirSync(path.join(web,'avatars'),{recursive:true});
fs.copyFileSync(path.join(__dirname,'../onefish-desktop/ui/stable-controls.js'),path.join(web,'stable-controls.js'));
fs.copyFileSync(path.join(__dirname,'node_modules/socket.io-client/dist/socket.io.min.js'),path.join(web,'socket.io.min.js'));
for(const name of ['altman.jpg','dario.jpg','musk.jpg','jensen.jpg','liang.webp'])fs.copyFileSync(path.join(__dirname,'../onefish-desktop/vendor/holdem/avatars',name),path.join(web,'avatars',name));
fs.writeFileSync(path.join(web,'LICENSES.txt'),fs.readFileSync(path.join(__dirname,'SERVER_LICENSES.txt'),'utf8')+'\n\nPoker engine and portraits: BubblePtr/dsh-holdem (MIT)\nhttps://github.com/BubblePtr/dsh-holdem\n\n'+fs.readFileSync(path.join(__dirname,'../onefish-desktop/vendor/holdem/LICENSE'),'utf8'));
esbuild.buildSync({entryPoints:[path.join(__dirname,'server.cjs')],bundle:true,platform:'node',target:'node22',format:'cjs',outfile:path.join(__dirname,'server.bundle.cjs'),external:['bufferutil','utf-8-validate'],legalComments:'inline',minify:true});
console.log('Built website and standalone server; desktop untouched');
