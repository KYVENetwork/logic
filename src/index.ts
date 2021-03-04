import Arweave from "arweave";
import ArweaveBundles from "arweave-bundles";
import deepHash from "arweave/node/lib/deepHash";
import {
  UploadFunction,
  ValidateFunction,
  UploadFunctionReturn,
  ValidateFunctionReturn,
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

export const CONTRACT = "1htMi-6Ue7jfxERuU4PKDulYpFMKwmDE5oZTgO_BEAI";

export default class KYVE {
  public uploadFunc: UploadFunction;
  public validateFunc: ValidateFunction;
  private buffer: UploadFunctionReturn[] = [];

  // TODO: Write interface for contract.
  public pool?: Object;
  public poolName: string;

  private keyfile: JWKInterface;

  constructor(
    uploadFunc: UploadFunction,
    validateFunc: ValidateFunction,
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
      console.log(
        `\nFound pool with name "${
          this.poolName
          // @ts-ignore
        }" in the KYVE contract.\n  architecture = ${this.pool!.architecture}`
      );
    } else {
      throw Error(
        `No pool with name "${this.poolName}" was found in the KYVE contract.`
      );
    }

    // @ts-ignore
    if (address === this.pool!.uploader) {
      console.log("\nRunning as an uploader ...");
      this.uploader();
    } else {
      console.log("\nRunning as a validator ...");
      this.validator();
    }
  }

  private uploader() {
    const node = new Observable<UploadFunctionReturn>((subscriber) =>
      this.uploadFunc(subscriber)
    );

    node.subscribe((data) => {
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
              { name: "Architecture", value: this.pool!.architecture },
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

      console.log(
        `\nSent a bundle with ${items.length} items\n  txID = ${
          tx.id
        }\n  cost = ${client.ar.winstonToAr(tx.reward)} AR`
      );
    }
  }

  private validator() {
    const node = new Observable<ValidateFunctionReturn>((subscriber) =>
      this.validateFunc(subscriber)
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
    const id = await interactWrite(client, this.keyfile, CONTRACT, {
      function: "deny",
      pool: this.poolName,
    });
    console.log(`Raised a dispute in the DAO.\n  txID = ${id}`);
  }
}
