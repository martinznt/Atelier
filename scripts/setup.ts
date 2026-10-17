import {randomBytes} from 'node:crypto';
import {existsSync,writeFileSync} from 'node:fs';
if(!existsSync('.dev.vars')){writeFileSync('.dev.vars',`MASTER_KEY="${randomBytes(32).toString('base64')}"\n`,{mode:0o600});console.log('Clé locale générée dans .dev.vars (ignorée par Git).');}
else console.log('.dev.vars existe déjà : conservé.');
console.log('Ensuite : npm run db:migrate puis npm run dev. Aucun service distant créé.');
