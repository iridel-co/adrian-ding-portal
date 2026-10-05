import type { Db } from "@/db";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type DbOrTx = Db | Tx;
