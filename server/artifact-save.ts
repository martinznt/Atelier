/** Conversation persistence is authoritative; a secondary artifact cannot abort it. */
export async function captureArtifact<T>(write:()=>Promise<T>,warn:()=>Promise<unknown>):Promise<T|undefined> {
 try{return await write();}catch{
  // The user-visible warning contains no provider response, credential or private text.
  try{await warn();}catch{/* Preserve the original conversation outcome if diagnostics fail. */}
  return undefined;
 }
}
