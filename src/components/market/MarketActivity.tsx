import { ArrowUpRight } from "lucide-react";
import type { MarketBook } from "../../lib/market/api";

export function MarketActivity({
  books,
  loading,
}: {
  books: MarketBook[];
  loading: boolean;
}) {
  const events = Array.from(
    new Map(
      books
        .flatMap((book) => book.activity ?? [])
        .map((event) => [
          `${event.tx_hash}:${event.event_name}:${JSON.stringify(event.payload ?? {})}`,
          event,
        ]),
    ).values(),
  ).sort((a, b) =>
    BigInt(a.block_number) > BigInt(b.block_number)
      ? -1
      : BigInt(a.block_number) < BigInt(b.block_number)
        ? 1
        : 0,
  );
  if (!events.length)
    return (
      <div className="market-empty" role="status">
        {loading
          ? "Loading market activity…"
          : "No confirmed market activity yet."}
      </div>
    );
  return (
    <div
      className="market-table-scroll"
      role="region"
      aria-label="Market activity"
      tabIndex={0}
    >
      <table className="market-table market-activity">
        <caption className="sr-only">Confirmed marketplace activity</caption>
        <thead>
          <tr>
            <th>Event</th>
            <th>Block</th>
            <th>Transaction</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event, index) => (
            <tr key={`${event.tx_hash}:${index}`}>
              <td>{event.event_name.replace(/([a-z])([A-Z])/g, "$1 $2")}</td>
              <td>{BigInt(event.block_number).toLocaleString("en-US")}</td>
              <td>
                <a
                  href={`https://etherscan.io/tx/${event.tx_hash}`}
                  target="_blank"
                  rel="noreferrer"
                  title={event.tx_hash}
                >
                  {event.tx_hash.slice(0, 10)}…{event.tx_hash.slice(-8)}{" "}
                  <ArrowUpRight size={15} />
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
