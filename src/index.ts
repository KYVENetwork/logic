import Arweave from "arweave";
import { JWKInterface } from "arweave/node/lib/wallet";
import { readContract } from "smartweave";

const client = new Arweave({
  host: "arweave.net",
  port: 443,
  protocol: "https",
});

export const CONTRACT = "yT-ElkFqDEawZakL58ztJ_JzST1PCruc5QBLptAfqAs";

export default class KYVE {
  public uploadFunc: Function;
  public validateFunc: Function;

  public pool?: string;
  public chain?: string;

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

    readContract(client, CONTRACT).then((state) => {
      if (options.pool in state.pools) {
        this.pool = options.pool;
        this.chain = state.pools[this.pool].chain;
      } else {
        throw Error(
          `Pool with name ${options.pool} not found in KYVE contract.`
        );
      }
    });
  }

  public run() {}
}
