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

export const CONTRACT = "yT-ElkFqDEawZakL58ztJ_JzST1PCruc5QBLptAfqAs";

export default class KYVE {
  public uploadFunc: Function;
  public validateFunc: Function;
  private buffer: {
    data: any;
    tags?: { name: string; value: string }[];
  }[] = [];

  public pool?: Object;
  public poolName: string;

  private keyfile: JWKInterface;

  constructor(
    uploadFunc: Function,
    validateFunc: Function,
    options: {
      pool: string;
      jwk: JWKInterface;
    }
  ) {
    this.uploadFunc = uploadFunc;
    this.validateFunc = validateFunc;

    this.poolName = options.pool;
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

    node.subscribe((data) => {
      // @ts-ignore
      this.buffer.push(data);
      this.bundleAndUpload();
    });
  }

  private async bundleAndUpload() {
    // @ts-ignore
    const bundleSize = this.pool!.bundleSize;

    if (this.buffer.length >= bundleSize) {
      const buffer = this.buffer;
      this.buffer = [];

      const items = [];
      for (const entry of buffer) {
        const item = await bundles.createData(
          {
            data: JSON.stringify(entry.data),
            tags: [
              { name: "Application", value: "KYVE - DEV" },
              { name: "Pool", value: this.poolName },
              // @ts-ignore
              // TODO: Change to "Architecture"
              { name: "Chain", value: this.pool!.chain },
              ...(entry.tags || []),
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
