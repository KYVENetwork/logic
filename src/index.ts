import Arweave from "arweave";
import ArweaveBundles from "arweave-bundles";
import ArDB from "ardb";
import deepHash from "arweave/node/lib/deepHash";
import {
  UploadFunction,
  ValidateFunction,
  UploadFunctionReturn,
  ValidateFunctionReturn,
  ListenFunctionReturn,
} from "./faces";
import { JWKInterface } from "arweave/node/lib/wallet";
import { readContract, interactWrite } from "smartweave";
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

export const CONTRACT = "v2p-0OhAxDCCMLjQ8e_6_YhT3Tfw2uUAbIQ3PXRtjr4";
export const APP_NAME = "KYVE - DEV";

export default class KYVE {
  public arweave: Arweave = client;
  public ardb: ArDB;

  public uploadFunc: UploadFunction;
  public validateFunc: ValidateFunction;
  private buffer: UploadFunctionReturn[] = [];

  // TODO: Write interface for contract.
  // TODO: Refetch!!!
  public pool: any;
  public poolName: string;

  private keyfile: JWKInterface;

  constructor(
    options: {
      pool: string;
      jwk: JWKInterface;
      arweave?: Arweave;
    },
    uploadFunc: UploadFunction,
    validateFunc: ValidateFunction
  ) {
    this.uploadFunc = uploadFunc;
    this.validateFunc = validateFunc;

    this.poolName = options.pool;
    this.keyfile = options.jwk;
    if (options.arweave) this.arweave = options.arweave;
    this.ardb = new ArDB(this.arweave);
  }

  public async run() {
    const state = await readContract(this.arweave, CONTRACT);
    if (this.poolName in state.pools) {
      this.pool = state.pools[this.poolName];
      console.log(
        `\nFound pool with name "${this.poolName}" in the KYVE contract.\n  architecture = ${this.pool.architecture}`
      );
    } else {
      throw Error(
        `No pool with name "${this.poolName}" was found in the KYVE contract.`
      );
    }

    const address = await this.arweave.wallets.getAddress(this.keyfile);
    if (address === this.pool.uploader) {
      console.log("\nRunning as an uploader ...");
      this.uploader();
    } else {
      console.log("\nRunning as a validator ...");
      this.validator();
    }
  }

  private listener() {
    return new Observable<ListenFunctionReturn>((subscriber) => {
      const main = async (latest: number) => {
        const height = (await this.arweave.network.getInfo()).height;

        if (latest === height) {
          return;
        } else {
          const res = await this.ardb
            .search()
            .min(latest)
            .max(height)
            .from(this.pool.uploader)
            .tag("Application", APP_NAME)
            .tag("Pool", this.poolName)
            .tag("Architecture", this.pool.architecture)
            .findAll();

          // @ts-ignore
          for (const { node } of res) {
            subscriber.next({
              id: node.id,
              transaction: node,
              block: node.block.height,
            });
          }
        }

        setTimeout(main, 300000, height);
      };

      this.arweave.network.getInfo().then((res) => main(res.height));
    });
  }

  private uploader() {
    const node = new Observable<UploadFunctionReturn>((subscriber) =>
      this.uploadFunc(subscriber, this.pool.config)
    );

    node.subscribe((data) => {
      this.buffer.push(data);
      this.bundleAndUpload();
    });
  }

  private async bundleAndUpload() {
    const bundleSize = this.pool.bundleSize;

    if (this.buffer.length >= bundleSize) {
      const buffer = this.buffer;
      this.buffer = [];

      const items = [];
      for (const entry of buffer) {
        const item = await bundles.createData(
          {
            data: JSON.stringify(entry.data),
            tags: [
              { name: "Application", value: APP_NAME },
              { name: "Pool", value: this.poolName },
              { name: "Architecture", value: this.pool.architecture },
              ...(entry.tags || []),
            ],
          },
          this.keyfile
        );
        items.push(await bundles.sign(item, this.keyfile));
      }

      const bundle = await bundles.bundleData(items);
      const tx = await this.arweave.createTransaction(
        { data: JSON.stringify(bundle) },
        this.keyfile
      );

      tx.addTag("Bundle-Format", "json");
      tx.addTag("Bundle-Version", "1.0.0");
      tx.addTag("Content-Type", "application/json");

      await this.arweave.transactions.sign(tx, this.keyfile);
      await this.arweave.transactions.post(tx);

      console.log(
        `\nSent a bundle with ${items.length} items\n  txID = ${
          tx.id
        }\n  cost = ${this.arweave.ar.winstonToAr(tx.reward)} AR`
      );
    }
  }

  private validator() {
    const node = new Observable<ValidateFunctionReturn>((subscriber) =>
      this.validateFunc(this.listener(), subscriber, this.pool.config)
    );

    node.subscribe((res) => {
      if (res.valid) {
        console.log(`\nSuccessfully validated a block.\n  txID = ${res.id}`);
      } else {
        console.log(`\nFound an invalid block.\n  txID = ${res.id}`);
        this.raiseConcern();
      }
    });
  }

  private async raiseConcern() {
    const id = await interactWrite(this.arweave, this.keyfile, CONTRACT, {
      function: "deny",
      pool: this.poolName,
    });
    console.log(`Raised a dispute in the DAO.\n  txID = ${id}`);
  }
}

export const getData = async (id: string) => {
  const res = await client.transactions.getData(id, {
    decode: true,
    string: true,
  });

  return res.toString();
};
