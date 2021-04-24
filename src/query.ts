import { arweaveClient } from "./extensions";
import ArDB from "ardb";
import { APP_NAME, getData } from "./index";
import { GQLEdgeTransactionInterface } from "ardb/lib/faces/gql";

export const arDB = new ArDB(arweaveClient);

type TransactionID = string;
type TransactionData = string;

export const query = async (
  poolID: number,
  limit: number = 100,
  deRef: boolean = false
): Promise<TransactionID[]> => {
  const ids: TransactionID[] | TransactionData[] = [];

  const result = (await arDB
    .search()
    .tag("Application", APP_NAME)
    .tag("Pool", poolID.toString())
    .limit(limit)
    .only(["id"])
    .find()) as GQLEdgeTransactionInterface[];

  for (let transaction of result) {
    const txID = transaction.node.id;
    if (deRef) {
      const data = await getData(txID);
      ids.push(data);
    } else {
      ids.push(txID);
    }
  }

  return ids;
};

export const next = async (deRef: boolean = false) => {
  const ids: TransactionID[] | TransactionData[] = [];

  const result = (await arDB.next()) as GQLEdgeTransactionInterface[];

  for (let transaction of result) {
    const txID = transaction.node.id;
    if (deRef) {
      const data = await getData(txID);
      ids.push(data);
    } else {
      ids.push(txID);
    }
  }

  return ids;
};
