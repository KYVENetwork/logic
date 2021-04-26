import { next, query } from "../query";

const chai = require("chai");
const chaiAsPromised = require("chai-as-promised");

chai.use(chaiAsPromised);

export const { assert, expect } = chai;

describe("Test query", () => {
  it("Loads data", async () => {
    const limit = 10;

    const ids = await query(0, limit);
    expect(ids.length).to.equal(limit);
  }).timeout(60 * 1000);

  it("Loads next data", async () => {
    const limit = 10;

    const ids = await next();
    expect(ids.length).to.equal(limit);
  }).timeout(60 * 1000);

  it("Derefs data", async () => {
    const limit = 10;

    const data = await query(0, limit, true);
    expect(data.length).to.equal(limit);
  }).timeout(60 * 1000);

  it("Derefs next data", async () => {
    const limit = 10;

    const data = await next(true);
    expect(data.length).to.equal(limit);
  }).timeout(60 * 1000);
})
