import Arweave from "arweave";
import { JWKInterface } from "arweave/node/lib/wallet";
import { readContract } from "smartweave";
import { Observable } from "rxjs";

const client = new Arweave({
  host: "arweave.net",
  port: 443,
  protocol: "https",
});

export const CONTRACT = "yT-ElkFqDEawZakL58ztJ_JzST1PCruc5QBLptAfqAs";

export default class KYVE {
  public uploadFunc: Function;
  public validateFunc: Function;

  public pool?: Object;
  public poolName?: string;

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

    this.keyfile = options.jwk;

    readContract(client, CONTRACT).then((state) => {
      if (options.pool in state.pools) {
        this.pool = state.pools[options.pool];
        this.poolName = options.pool;
      } else {
        throw Error(
          `Pool with name ${options.pool} not found in KYVE contract.`
        );
      }
    });
  }

  public async run() {
    const address = await client.wallets.getAddress(this.keyfile);

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
    let blocks = [];

    node.subscribe(async (block) => {
      blocks.push(block);

      // TODO: Check contract for batch size and upload.
    });
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
