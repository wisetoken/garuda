import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAddress } from "viem";
import { ethereumClient } from "../lib/portfolio";

const owlAvatarKey = "garuda:owl-avatars:v1";
const owlAvatarTtl = 24 * 60 * 60 * 1000;
type OwlAvatarEntry = { url: string | null; at: number };

function owlAvatarCache(): Record<string, OwlAvatarEntry> {
  try {
    const raw = JSON.parse(localStorage.getItem(owlAvatarKey) ?? "{}") as unknown;
    if (!raw || typeof raw !== "object") return {};
    return raw as Record<string, OwlAvatarEntry>;
  } catch {
    return {};
  }
}

function readOwlAvatar(address: string): OwlAvatarEntry | undefined {
  const entry = owlAvatarCache()[address.toLowerCase()];
  if (!entry || typeof entry.at !== "number" || Date.now() - entry.at > owlAvatarTtl) return undefined;
  if (entry.url !== null && (typeof entry.url !== "string" || !entry.url.startsWith("https://"))) return undefined;
  return entry;
}

function rememberOwlAvatar(address: string, url: string | null) {
  try {
    const cache = owlAvatarCache();
    cache[address.toLowerCase()] = { url, at: Date.now() };
    const entries = Object.entries(cache)
      .filter(([, value]) => value && typeof value.at === "number")
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, 200);
    localStorage.setItem(owlAvatarKey, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // The in-memory query cache still covers this session.
  }
}

function resolvedOwlUrl(value: unknown) {
  return typeof value === "string" && value.startsWith("https://") ? value : null;
}

export function AddressIdentity({ address }: { address: string }) {
  const id = address.toLowerCase();
  const storedOwl = readOwlAvatar(id);
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["identity", id],
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
    queryKey: ["owl-avatar", id],
    queryFn: async () => {
      const response = await fetch(
        `/api/opensea/nfts/${address}?collection=owlmybabies&limit=1`,
        { signal: AbortSignal.timeout(10_000) },
      );
      if (!response.ok) throw new Error("Avatar unavailable");
      const body = (await response.json()) as {
        nfts?: { display_image_url?: string; image_url?: string }[];
      };
      const url = resolvedOwlUrl(body.nfts?.[0]?.display_image_url || body.nfts?.[0]?.image_url);
      rememberOwlAvatar(id, url);
      return url;
    },
    ...(storedOwl ? { initialData: storedOwl.url, initialDataUpdatedAt: storedOwl.at } : {}),
    staleTime: owlAvatarTtl,
    gcTime: owlAvatarTtl,
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
          referrerPolicy="no-referrer"
          onError={(event) => {
            if (event.currentTarget.src.endsWith("/shadow-owl.jpg")) return;
            rememberOwlAvatar(id, null);
            queryClient.setQueryData(["owl-avatar", id], null);
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
