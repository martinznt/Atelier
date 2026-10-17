import {openDB} from 'idb';
import {createVault} from './vault-store';

const db=openDB('atelier-private-v1',1,{upgrade(d){
 d.createObjectStore('vaults',{keyPath:'user'});
 d.createObjectStore('records',{keyPath:'id'});
}});

export const vault=createVault(db);
