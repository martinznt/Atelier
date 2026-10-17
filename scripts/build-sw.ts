import {readFileSync,readdirSync,writeFileSync} from 'node:fs';import {createHash} from 'node:crypto';
const assets=['/index.html','/manifest.webmanifest','/icon-192.png','/icon-512.png','/icon.svg',...readdirSync('dist/assets').map(f=>`/assets/${f}`)];
const build=createHash('sha256');for(const file of assets)build.update(readFileSync(`dist${file}`));
writeFileSync('dist/sw.js',readFileSync('public/sw.js','utf8').replace('__BUILD__',build.digest('hex').slice(0,12)).replace('__ASSETS__',JSON.stringify(assets)));
console.log(`Shell PWA : ${assets.length} ressources versionnées. Aucune réponse API mise en cache.`);
