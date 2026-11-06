/** Bind the storage target to the wallet approval; replay cannot move it later. */
export function extendOfferMessage(hash: string, entityKey: string, expiresAt: number) {
  return `Garuda\nExtend Arkiv offer storage\n${hash.toLowerCase()}\n${entityKey.toLowerCase()}\nStore until (Unix seconds): ${expiresAt}\nSigned trading deadline unchanged.`;
}
