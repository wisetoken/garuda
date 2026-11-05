import { getAddress } from "viem";
export const STAKE_COLLECTIONS = {
  signature: {
    id: "signature", name: "Signature", address: getAddress("0x48791dbdfb38baa58e48329148c321bf33b3c1e1"),
    supportsScraping: true, purchaseFeeBps: 50,
  },
  advanced: {
    id: "advanced", name: "Advanced", address: getAddress("0xf863a603501fcd30f56dffcb6700a25effefbe94"),
    supportsScraping: false, purchaseFeeBps: 200,
  },
} as const;
export type StakeCollectionId = keyof typeof STAKE_COLLECTIONS;
export function stakeCollection(address: string) {
  const found = Object.values(STAKE_COLLECTIONS).find(c => c.address.toLowerCase() === address.toLowerCase());
  if (!found) throw new Error("Unsupported stake collection.");
  return found;
}
