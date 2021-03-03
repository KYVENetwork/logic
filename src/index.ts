import Arweave from "arweave";
import ArweaveBundles from "arweave-bundles";
import deepHash from "arweave/node/lib/deepHash";
import { JWKInterface } from "arweave/node/lib/wallet";
import { readContract } from "smartweave";
import { Observable } from "rxjs";

const client = new Arweave({
  host: "arweave.net",
  port: 443,
  protocol: "https",
});

const bundles = ArweaveBundles({
  utils: Arweave.utils,
  crypto: Arweave.crypto,
  deepHash,
});

// From: https://stackoverflow.com/questions/6491463/accessing-nested-javascript-objects-and-arrays-by-string-path
const getValue = (obj: any, key: string): any => {
  key = key.replace(/\[(\w+)\]/g, ".$1"); // convert indexes to properties
  key = key.replace(/^\./, ""); // strip a leading dot

  const keys = key.split(".");
  for (let i = 0; i < keys.length; ++i) {
    if (keys[i] in obj) {
      obj = obj[keys[i]];
    } else {
      return;
    }
  }

  return obj;
};

interface IndexKeys {
  transactionKey: string;
  transactionHashKey: string;
  hashKey: string;
  heightKey: string;
}

export const CONTRACT = "yT-ElkFqDEawZakL58ztJ_JzST1PCruc5QBLptAfqAs";

export default class KYVE {
  public uploadFunc: Function;
  public validateFunc: Function;
  private blocks: any[] = [];

  public pool?: Object;
  public poolName: string;

  private keyfile: JWKInterface;

  public keys: IndexKeys;

  constructor(
    uploadFunc: Function,
    validateFunc: Function,
    options: {
      pool: string;
      keys: IndexKeys;
      jwk: JWKInterface;
    }
  ) {
    this.uploadFunc = uploadFunc;
    this.validateFunc = validateFunc;

    this.poolName = options.pool;
    this.keys = options.keys;
    this.keyfile = options.jwk;
  }

  public async run() {
    const address = await client.wallets.getAddress(this.keyfile);

    const state = await readContract(client, CONTRACT);
    if (this.poolName in state.pools) {
      this.pool = state.pools[this.poolName];
    } else {
      throw Error(
        `No pool with name "${this.poolName}" was found in the KYVE contract.`
      );
    }

    // @ts-ignore
    // TODO: Write interface for contract.
    if (address === this.pool!.uploader) {
      await this.uploader();
    } else {
      await this.validator();
    }
  }

  private async uploader() {
    const node = new Observable((subscribe) => this.uploadFunc(subscribe));

    node.subscribe((block) => {
      this.blocks.push(block);
      this.bundleAndUpload();
    });
  }

  private async bundleAndUpload() {
    // @ts-ignore
    const bundleSize = this.pool!.bundleSize;

    if (this.blocks.length >= bundleSize) {
      const blocks = this.blocks;
      this.blocks = [];

      const items = [];
      for (const block of blocks) {
        const txs = getValue(block, this.keys.transactionKey);
        const txTags: { name: string; value: string }[] = [];
        if (txs) {
          for (const tx of txs) {
            txTags.push({
              name: "Transaction",
              value: getValue(tx, this.keys.transactionHashKey),
            });
          }
        }

        const item = await bundles.createData(
          {
            data: JSON.stringify(block),
            tags: [
              { name: "Application", value: "KYVE - DEV" },
              { name: "Pool", value: this.poolName },
              // @ts-ignore
              { name: "Chain", value: this.pool!.chain },
              { name: "Block", value: getValue(block, this.keys.hashKey) },
              { name: "Height", value: getValue(block, this.keys.heightKey) },
              ...txTags,
            ],
          },
          this.keyfile
        );
        items.push(await bundles.sign(item, this.keyfile));
      }

      const bundle = await bundles.bundleData(items);
      const tx = await client.createTransaction(
        { data: JSON.stringify(bundle) },
        this.keyfile
      );

      tx.addTag("Bundle-Format", "json");
      tx.addTag("Bundle-Version", "1.0.0");
      tx.addTag("Content-Type", "application/json");

      await client.transactions.sign(tx, this.keyfile);
      await client.transactions.post(tx);
    }
  }

  private async validator() {
    const node = new Observable((subscribe) => this.validateFunc(subscribe));

    node.subscribe(async (res) => {
      // @ts-ignore
      if (res.valid) {
        // TODO: Log.
      } else {
        // TODO: Raise concern in DAO.
      }
    });
  }
}
