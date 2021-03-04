# KYVE

## About

KYVE is an initiative to store any data stream, with built-in validation. By leveraging the Arweave blockchain, we can
permanently and immutably store this data.
The network is powered by decentralised archivers and validators. These nodes reside in pools, each pool focusing on
archiving a specific data stream. Pools are funded by $KYVE tokens, and anyone can fund these storage initiatives by
depositing tokens.
A designated archiver is appointed by a DAO (Decentralized Autonomous Organisation) for each pool. Nodes are
incentivised by a unique staking system, which involves them locking their $KYVE tokens while being active in the pool.
Validators will "get together" and vote on whether the designated archiver is properly doing it's job. If the validators
come to a consensus that the archiver is no longer acting honestly or reliably, a new archiver will be decided upon in
the DAO. Validators can seemlessly transition into an archiver if need be.

## Usage

### Installation

```
yarn add @kyve/logic
```

### Using KYVE in your Application

#### Initiating a node

```ts
import KYVE from "@kyve/logic";

const node = new KYVE();
```

#### Node configuration

KYVE only requires two custom functions. One which fetches the data from your
data source and one which validates this data. You can then simply add these two functions into the KYVE instance.

###### Specifying an upload function

To pass data into KYVE, simply call `subscriber.next()`

```ts
const myDataFetcher = async (subscriber) => {
  // use your custom logic here
  const data = ...
  subscriber.next({data})
}
```

You can also add custom tags to your transactions.

```ts
const myDataFetcher = async (subscriber) => {
  // use your custom logic here
  const data = ...
  const tags = [...]
  subscriber.next({data, tags})
}
```

###### Specifying a validation function

```ts
const myDataValidator = async (subscriber) => {
  // fetch the data uploaded onto Arweave
  const fetchedData = ...
  const arweaveTxId = ...
  // validate the data with your custom logic
  const isValid = ...
  // pass the resulst into KYVE
  subscriber.next({ valid: isValid, id: arweaveTxId })
}
```

###### Setting the functions in the node

```ts
import KYVE from "@kyve/logic";

const node = new KYVE(myDataFetcher, myDataValidator);
```

###### Pool configuration
Next you need to set up the pool. You can create a new pool here.
After you have created the pool, insert its name and your arweave keyfile into the config.

```ts
import KYVE from "@kyve/logic";

const pool = "demo-pool"
const jwk = ...

const node = new KYVE(myDataFetcher, myDataValidator, {pool, jwk});
```

###### Running your node
To run your node, simply call the `.run()` function.

```ts
import KYVE from "@kyve/logic";

const pool = "demo-pool"
const jwk = ...

const node = new KYVE(myDataFetcher, myDataValidator, {pool, jwk});

(async () => {
  await node.run();
})();
```