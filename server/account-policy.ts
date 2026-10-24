export const MIN_PASSWORD_LENGTH=8;
export const MAX_PASSWORD_LENGTH=128;
/** Conservative address syntax, normalized only for this application's login key. */
export function normalizeEmail(value:unknown):string|null {
 if(typeof value!=='string')return null;
 if(value.length>1024)return null;
 const email=value.trim().toLowerCase();
 if(email.length>254||email.length<3)return null;
 const [local,domain,...extra]=email.split('@');
 if(extra.length||!local||local.length>64||!domain||!domain.includes('.')||local.startsWith('.')||local.endsWith('.')||local.includes('..'))return null;
 if(!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local))return null;
 if(domain.split('.').some(label=>!label||label.length>63||!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)))return null;
 return email;
}
export function validNewPassword(value:unknown):value is string {
 return typeof value==='string'&&value.length<=MAX_PASSWORD_LENGTH&&Array.from(value).length>=MIN_PASSWORD_LENGTH;
}
