import {
  deploymentScope,
  parseSignedSale,
  sameAddress,
  type SalesDeployment,
  type SignedSale,
} from "../blend/sales";
export function recoveryKey(d: SalesDeployment, address: string) {
  return `garuda:signed-orders:v1:${deploymentScope(d)}:${address.toLowerCase()}`;
}
export function readRecovery(
  storage: Pick<Storage, "getItem">,
  d: SalesDeployment,
  address: string,
): SignedSale[] {
  const raw = JSON.parse(storage.getItem(recoveryKey(d, address)) ?? "[]");
  if (!Array.isArray(raw) || raw.length > 100)
    throw new Error("Saved order data could not be read.");
  return raw.map((value) => {
    const parsed = parseSignedSale(value, d);
    if (!sameAddress(parsed.order.maker, address))
      throw new Error("Saved order belongs to another wallet.");
    return parsed.signed;
  });
}
export function rememberOrder(
  storage: Pick<Storage, "getItem" | "setItem">,
  d: SalesDeployment,
  address: string,
  signed: SignedSale,
) {
  const parsed = parseSignedSale(signed, d);
  if (!sameAddress(parsed.order.maker, address))
    throw new Error("Signed order belongs to another wallet.");
  const hash = parsed.hash;
  const existing = readRecovery(storage, d, address);
  const next = [
    ...existing.filter((value) => parseSignedSale(value, d).hash !== hash),
    signed,
  ];
  if (next.length > 100)
    throw new Error(
      "Saved order storage is full. Cancel earlier orders before signing more.",
    );
  storage.setItem(recoveryKey(d, address), JSON.stringify(next));
}
export function forgetCancelledOrder(
  storage: Pick<Storage, "getItem" | "setItem">,
  d: SalesDeployment,
  address: string,
  signed: SignedSale,
) {
  const hash = parseSignedSale(signed, d).hash;
  storage.setItem(
    recoveryKey(d, address),
    JSON.stringify(
      readRecovery(storage, d, address).filter(
        (value) => parseSignedSale(value, d).hash !== hash,
      ),
    ),
  );
}

export function prepareRecovery(
  storage: Pick<Storage, "getItem" | "setItem">,
  d: SalesDeployment,
  address: string,
) {
  const existing = readRecovery(storage, d, address);
  if (existing.length >= 100)
    throw new Error(
      "Saved order storage is full. Cancel earlier orders before signing more.",
    );
  storage.setItem(recoveryKey(d, address), JSON.stringify(existing));
}
