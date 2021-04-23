import Arweave from "arweave";
import ArDB from "ardb";
import {
  ListenFunctionReturn,
  UploadFunction,
  UploadFunctionReturn,
  ValidateFunction,
  ValidateFunctionReturn,
} from "./faces";
import { JWKInterface } from "arweave/node/lib/wallet";
import { readContract } from "smartweave";
import { Observable } from "rxjs";
import { arweaveBundles as bundles, arweaveClient } from "./extensions";

import Contract from "@kyve/contract-lib";

export const APP_NAME = "KYVE - DEV";

export default class KYVE {
  public arweave: Arweave = arweaveClient;
  public ardb: ArDB;
  public contract: Contract;

  public uploadFunc: UploadFunction;
  public validateFunc: ValidateFunction;
  private buffer: UploadFunctionReturn[] = [];

  // TODO: Write interface for contract.
  // TODO: Refetch!!!
  public pool: any;
  public poolID: number;
  public stake: number;

  private readonly keyfile: JWKInterface;

  constructor(
    options: {
      pool: number;
      stake: number;
      jwk: JWKInterface;
      arweave?: Arweave;
    },
    uploadFunc: UploadFunction,
    validateFunc: ValidateFunction
  ) {
    this.uploadFunc = uploadFunc;
    this.validateFunc = validateFunc;

    this.poolID = options.pool;
    this.keyfile = options.jwk;
    this.stake = options.stake;

    if (options.arweave) {
      this.arweave = options.arweave;
    }

    this.ardb = new ArDB(this.arweave);
    this.contract = new Contract(this.arweave, this.keyfile);
  }

  public async run() {
    const state = await readContract(this.arweave, this.contract.ID);
    if (this.poolID >= 0 && this.poolID < state.pools.length) {
      this.pool = state.pools[this.poolID];
      console.log(
        `\nFound pool with name "${this.pool.name}" in the KYVE contract.\n  architecture = ${this.pool.architecture}`
      );
    } else {
      throw Error(
        `No pool with id "${this.poolID}" was found in the KYVE contract.`
      );
    }

    const address = await this.arweave.wallets.getAddress(this.keyfile);
    if (address === this.pool.uploader) {
      console.log("\nRunning as an uploader ...");
      this.uploader();
    } else {
      // check if validator has enough stake
      const currentStake = state.pools[this.poolID].vault[address];
      const diff = this.stake - currentStake;

      // todo handle case if desired stake is smaller than current stake
      if (diff > 0) {
        const id = await this.contract.lock(this.poolID, diff);
        // todo await transaction to be complete
      }

      // register validator
      const id = await this.contract.register(this.poolID);

      let status = (await this.arweave.transactions.getStatus(id)).status;

      while (status !== 200) {
        await sleep(30000);

        status = (await this.arweave.transactions.getStatus(id)).status;

        if (status === 200 || status === 202) {
          // mined / pending
          console.log("\nWaiting for registration to be mined.");
        } else {
          throw Error(`Registration for pool with id ${this.poolID} failed.`);
        }
      }

      console.log("\nRunning as a validator ...");
      this.validator();

      process.on("SIGINT", async () => {
        await this.contract.unregister(this.poolID);
        console.log("\nUnregistered");
        process.exit();
      });
    }
  }

  private listener() {
    return new Observable<ListenFunctionReturn>((subscriber) => {
      const main = async (latest: number) => {
        const height = (await this.arweave.network.getInfo()).height;

        console.log(`\n[listener] height = ${height}, latest = ${latest}.`);

        if (latest !== height) {
          const res = await this.ardb
            .search()
            .min(latest)
            .max(height)
            .from(this.pool.uploader)
            .tag("Application", APP_NAME)
            .tag("Pool", this.poolID.toString())
            .tag("Architecture", this.pool.architecture)
            .findAll();

          // @ts-ignore
          console.log(`\n[listener] Found ${res.length} new transactions.`);

          // @ts-ignore
          for (const { node } of res) {
            console.log(
              `\n[listener] Parsing transaction.\n  txID = ${node.id}`
            );
            subscriber.next({
              id: node.id,
              transaction: node,
              block: node.block.height,
            });
          }
        }

        setTimeout(main, 150000, height);
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
    console.log(`\nBuffer size is now: ${this.buffer.length}`);
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
              { name: "Pool", value: this.poolID.toString() },
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
    const id = await this.contract.deny(this.poolID);
    console.log(`\nRaised a dispute in the DAO.\n  txID = ${id}`);
  }
}

export const getData = async (id: string) => {
  const res = await arweaveClient.transactions.getData(id, {
    decode: true,
    string: true,
  });

  return res.toString();
};

const sleep = async (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};
