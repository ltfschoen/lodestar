import {PrivateEth1Network} from "../../../../src/eth1/dev";
import {ethers, Wallet} from "ethers";
import {expect} from "chai";
import {ILogger, WinstonLogger} from "@chainsafe/lodestar-utils/lib/logger";
import {describe, before, after, it} from "mocha";

describe("Eth1 dev network", function () {

  const logger: ILogger = new WinstonLogger();

  before(() => {
    logger.silent = true;
  });

  after(() => {
    logger.silent = false;
  });

  it("should start as configured", async () => {
    const network = new PrivateEth1Network({
      host: "127.0.0.1",
      port: 34568,
      mnemonic: "test",
      defaultBalance: 1400
    },
    {
      logger,
    }
    );
    await network.start();
    const accountBalance = await new Wallet(
      network.accounts()[9],
      new ethers.providers.JsonRpcProvider(network.rpcUrl())).getBalance();
    expect(accountBalance.gt(ethers.utils.parseEther("1300"))).to.be.true;
    expect(network.rpcUrl()).to.be.equal("http://127.0.0.1:34568");
    expect(network.mnemonic()).to.be.equal("test");
    expect(network.accounts().length).to.be.equal(10);
    await network.stop();
  });

  it("should deploy deposit contract", async function() {
    this.timeout(3000);
    const network = new PrivateEth1Network({
      host: "127.0.0.1",
      port: 34567,
      mnemonic: "test",
      defaultBalance: 1400
    },
    {
      logger,
    }
    );
    await network.start();
    const address = await network.deployDepositContract();
    expect(address).to.not.be.null;
    await network.stop();
  });
});
