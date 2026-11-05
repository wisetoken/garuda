import { useQuery } from "@tanstack/react-query";
import { getAddress } from "viem";
import { ethereumClient } from "../lib/portfolio";
export function AddressIdentity({ address }: { address: string }) {
  const { data } = useQuery({
    queryKey: ["identity", address.toLowerCase()],
    queryFn: async () => {
      const name = await ethereumClient.getEnsName({
        address: getAddress(address),
      });
      const avatar = name
        ? await ethereumClient.getEnsAvatar({ name }).catch(() => null)
        : null;
      return { name, avatar };
    },
    staleTime: 3_600_000,
    retry: false,
  });
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`,
    hue = parseInt(address.slice(2, 6), 16) % 360;
  return (
    <a
      className="address-identity"
      href={`https://etherscan.io/address/${address}`}
      target="_blank"
      rel="noreferrer"
      title={address}
    >
      <span
        className="address-avatar"
        style={{
          background: `linear-gradient(135deg,hsl(${hue} 48% 62%),hsl(${(hue + 60) % 360} 40% 28%))`,
        }}
      >
        {data?.avatar?.startsWith("https://") ? (
          <img
            src={data.avatar}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          address.slice(2, 4).toUpperCase()
        )}
      </span>
      <span>
        {data?.name ?? short}
        {data?.name && <small>{short}</small>}
      </span>
    </a>
  );
}
