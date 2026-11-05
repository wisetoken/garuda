import { readFile } from "node:fs/promises";
import { parseSalesDeployment } from "../../src/lib/blend/sales";

type Environment = Record<string, string | undefined>;
const loopback = (host: string) =>
    ["localhost", "127.0.0.1", "[::1]"].includes(host);

/** Only the deployment manifest is public. RPC and database credentials never enter it. */
export async function readSalesRuntime(env: Environment = process.env) {
    if (!env.GARUDA_DEPLOYMENT_JSON && !env.GARUDA_DEPLOYMENT_FILE) return null;
    if (env.GARUDA_DEPLOYMENT_JSON && env.GARUDA_DEPLOYMENT_FILE)
        throw new Error("Configure one Garuda deployment source.");
    const deployment = parseSalesDeployment(
        JSON.parse(
            env.GARUDA_DEPLOYMENT_JSON ??
                (await readFile(env.GARUDA_DEPLOYMENT_FILE!, "utf8")),
        ),
    );
    const local = deployment.environment === "local-fork";
    if (local && (env.VERCEL || env.NODE_ENV === "production"))
        throw new Error("Local-fork service is development-only.");
    const rpcUrl = local
        ? deployment.rpcUrl
        : (env.GARUDA_RPC_URL ?? env.MAINNET_RPC_URL);
    if (!rpcUrl) throw new Error("An Ethereum RPC endpoint is required.");
    const rpc = new URL(rpcUrl);
    if (
        !local &&
        (rpc.protocol !== "https:" || loopback(rpc.hostname) || rpc.hash)
    )
        throw new Error("Mainnet RPC must use HTTPS.");
    const database = new URL(env.GARUDA_DATABASE_URL ?? "");
    if (!["postgres:", "postgresql:"].includes(database.protocol))
        throw new Error("A dedicated PostgreSQL database is required.");
    if (local && !loopback(database.hostname))
        throw new Error("Fork testing requires a loopback database.");
    const remoteDatabase = !loopback(database.hostname);
    if (
        remoteDatabase &&
        database.searchParams.get("sslmode") !== "verify-full"
    )
        throw new Error("Remote Garuda databases require sslmode=verify-full.");
    if (
        !local &&
        loopback(database.hostname) &&
        (env.VERCEL || env.NODE_ENV === "production")
    )
        throw new Error("Production Garuda requires its hosted database.");
    // pg-connection-string must not override certificate verification via URL SSL options.
    if (remoteDatabase) {
        for (const key of [...database.searchParams.keys()])
            if (key.toLowerCase().startsWith("ssl"))
                database.searchParams.delete(key);
    }
    return {
        deployment,
        rpcUrl,
        database: {
            connectionString: database.href,
            ...(remoteDatabase
                ? { ssl: { rejectUnauthorized: true as const } }
                : {}),
            max: 5,
            connectionTimeoutMillis: 5000,
            statement_timeout: 20_000,
        },
    };
}
