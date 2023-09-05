import express from "express";
import { RedisClientType, WatchError, createClient } from "redis";
import { json } from "body-parser";

const DEFAULT_BALANCE = 100;

interface ChargeResult {
    isAuthorized: boolean;
    remainingBalance: number;
    charges: number;
}

async function connect(): Promise<ReturnType<typeof createClient>> {
    const url = `redis://${process.env.REDIS_HOST ?? "localhost"}:${process.env.REDIS_PORT ?? "6379"}`;
    console.log(`Using redis URL ${url}`);
    const client = createClient({ url });
    await client.connect();
    return client;
}

async function reset(account: string): Promise<void> {
    const client = await connect();
    try {
        await client.set(`${account}/balance`, DEFAULT_BALANCE);
    } finally {
        await client.disconnect();
    }
}

async function getChargeScriptSha(client: ReturnType<typeof createClient>): Promise<string> {
    const cachedSha = await client.get('chargeScriptSha');
    if (cachedSha) {
        return cachedSha;
    }

    const luaScript = 
`local initial = redis.call('get', KEYS[1])
local new = redis.call('incrby', KEYS[1], ARGV[1])
if new < 0
then
    redis.call('set', KEYS[1], initial)
    return { "false", initial }
else
    return { "true", new }
end`;

    const sha = await client.scriptLoad(luaScript);
    await client.set('chargeScriptSha', sha);
    return sha;
}

async function charge(account: string, charges: number): Promise<ChargeResult> {
    const client = await connect();
    try {
        const sha = await getChargeScriptSha(client);
        const scriptResult = await client.evalSha(sha, { keys: [`${account}/balance`], arguments: [ (-charges).toString() ] });
        const isAuthorized = ((scriptResult as Array<string>)[0] || 'false') === 'true';
        const remainingBalance = (scriptResult as Array<string>)[1];
        return { isAuthorized, remainingBalance: parseInt(remainingBalance), charges: isAuthorized ? charges : 0 };
    } finally {
        await client.disconnect();
    }
}

export function buildApp(): express.Application {
    const app = express();
    app.use(json());
    app.post("/reset", async (req, res) => {
        try {
            const account = req.body.account ?? "account";
            await reset(account);
            console.log(`Successfully reset account ${account}`);
            res.sendStatus(204);
        } catch (e) {
            console.error("Error while resetting account", e);
            res.status(500).json({ error: String(e) });
        }
    });
    app.post("/charge", async (req, res) => {
        try {
            const account = req.body.account ?? "account";
            const result = await charge(account, req.body.charges ?? 10);
            console.log(`Successfully charged account ${account}. Response - ${JSON.stringify(result)}`);
            res.status(200).json(result);
        } catch (e) {
            console.error("Error while charging account", e);
            res.status(500).json({ error: String(e) });
        }
    });
    return app;
}
