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
  const { data: owlAvatar } = useQuery({
    queryKey: ["owl-avatar", address.toLowerCase()],
    queryFn: async () => {
      const response = await fetch(
        `/api/opensea/nfts/${address}?collection=owlmybabies&limit=1`,
        { signal: AbortSignal.timeout(10_000) },
      );
      if (!response.ok) throw new Error("Avatar unavailable");
      const data = (await response.json()) as {
        nfts?: { display_image_url?: string; image_url?: string }[];
      };
      return (
        data.nfts?.[0]?.display_image_url || data.nfts?.[0]?.image_url || null
      );
    },
    staleTime: 3_600_000,
    retry: false,
  });
  const avatar =
    [owlAvatar, data?.avatar].find((value) => value?.startsWith("https://")) ??
    "/shadow-owl.jpg";
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`,
    avatarLabel = data?.name ?? short;
  return (
    <a
      className="address-identity"
      href={`https://etherscan.io/address/${address}`}
      target="_blank"
      rel="noreferrer"
      title={address}
    >
      <span className="address-avatar">
        <img
          src={avatar}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(event) => {
            if (!event.currentTarget.src.endsWith("/shadow-owl.jpg"))
              event.currentTarget.src = "/shadow-owl.jpg";
          }}
        />
      </span>
      <span>
        {avatarLabel}
        {data?.name && <small>{short}</small>}
      </span>
    </a>
  );
}
