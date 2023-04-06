import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import {
  takeSnapshot,
  SnapshotRestorer,
  setBalance,
  time,
  impersonateAccount,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  SyntheX,
  MockToken,
  Pool,
  MockPriceFeed,
  PriceOracle,
  ERC20X,
  Vault,
  WETH9,
} from "../../typechain-types";

const parseEther = ethers.utils.parseEther;
const toBN = ethers.BigNumber.from;
const ZERO_ADDRESS = ethers.constants.AddressZero;
const provider = ethers.provider;

describe("PoolScenarios", function () {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let charlie: SignerWithAddress;
  let dave: SignerWithAddress;

  let syntheX: SyntheX;
  let collateral: MockToken;
  let collateral2: MockToken;
  let rewardToken: MockToken;
  let pool: Pool;
  let feed: MockPriceFeed;
  let feedSynth: MockPriceFeed;
  let oracle: PriceOracle;
  let synth: ERC20X;
  let vault: Vault;
  let weth: WETH9;

  let price: any;
  let priceSynth: any;

  let snapshotA: SnapshotRestorer;

  before(async function () {
    [bob, owner, alice, charlie, dave] = await ethers.getSigners();

    const SyntheX = await ethers.getContractFactory("SyntheX");
    syntheX = (await upgrades.deployProxy(SyntheX, [
      owner.address,
      alice.address,
      bob.address,
    ])) as SyntheX;

    const MockToken = await ethers.getContractFactory("MockToken");
    collateral = (await MockToken.deploy("Coll", "CLT", 18)) as MockToken;
    collateral2 = (await MockToken.deploy("Coll2", "CLT2", 18)) as MockToken;
    rewardToken = (await MockToken.deploy("Reward", "RWD", 18)) as MockToken;

    const Vault = await ethers.getContractFactory("Vault");
    vault = await Vault.deploy(syntheX.address);

    const VAULT = ethers.utils.id("VAULT");
    await syntheX.connect(alice).setAddress(VAULT, vault.address);

    const WETH9 = await ethers.getContractFactory("WETH9");
    weth = await WETH9.deploy();

    const Pool = await ethers.getContractFactory("Pool");
    pool = (await upgrades.deployProxy(Pool.connect(bob), [
      "First",
      "FRST",
      syntheX.address,
      weth.address,
    ])) as Pool;

    //setup rewards
    await rewardToken
      .connect(alice)
      .mint(syntheX.address, parseEther("1000000"));

    const speed = parseEther("0.0000001");
    const addToList = true;
    await syntheX
      .connect(bob)
      .setPoolSpeed(rewardToken.address, pool.address, speed, addToList);

    //additional setup
    await pool.connect(bob).unpause();
    await pool.connect(alice).setIssuerAlloc(5000);

    //setup synth
    const ERC20X = await ethers.getContractFactory("ERC20X");
    synth = (await upgrades.deployProxy(
      ERC20X,
      ["Synth", "SNTH", pool.address, syntheX.address],
      {
        unsafeAllow: ["delegatecall"],
      }
    )) as ERC20X;
    const mintFee = parseEther("0.000000000000000001");
    const burnFee = parseEther("0.000000000000000001");
    await pool.connect(alice).addSynth(synth.address, mintFee, burnFee);
    await pool.connect(alice).setFeeToken(synth.address);

    //setup collateral
    const collateralParams = {
      cap: parseEther("100000"),
      baseLTV: "8000",
      liqThreshold: "9000",
      liqBonus: "10500",
      isActive: true,
      totalDeposits: 0,
    };
    await pool
      .connect(alice)
      .updateCollateral(collateral.address, collateralParams);
    await collateral.mint(dave.address, parseEther("100"));
    await collateral.mint(charlie.address, parseEther("100"));

    await pool
      .connect(alice)
      .updateCollateral(collateral2.address, collateralParams);
    await collateral2.mint(dave.address, parseEther("100"));
    await collateral2.mint(charlie.address, parseEther("100"));

    //setup price feed
    const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
    price = parseEther("0.0000000001");
    const decimals = 18;
    feed = (await MockPriceFeed.deploy(price, decimals)) as MockPriceFeed;

    priceSynth = parseEther("1");
    const decimalsSynth = 18;
    feedSynth = (await MockPriceFeed.deploy(
      price,
      decimalsSynth
    )) as MockPriceFeed;

    //setup oracle
    const PriceOracle = await ethers.getContractFactory("PriceOracle");
    const baseCurrencyUnit = 1e8;
    oracle = (await PriceOracle.deploy(
      syntheX.address,
      [collateral.address, synth.address, collateral2.address],
      [feed.address, feedSynth.address, feed.address],
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      baseCurrencyUnit
    )) as PriceOracle;
    await pool.connect(alice).setPriceOracle(oracle.address);

    snapshotA = await takeSnapshot();
  });

  afterEach(async function () {
    await snapshotA.restore();
  });

  describe("Deposit/borrow/withdraw and reward calculation", function () {
    it("Should get rewards after repay if rewards off before repay", async () => {
      //deposit collateral
      await collateral.connect(dave).approve(pool.address, parseEther("100"));
      await pool.connect(dave).deposit(collateral.address, parseEther("100"));

      //issue debt
      await synth
        .connect(dave)
        .mint(parseEther("100"), dave.address, ZERO_ADDRESS);

      //3 days
      await time.increase(60 * 60 * 24 * 3);

      // get rewards accrued
      const rewards = await syntheX
        .connect(dave)
        .callStatic.getRewardsAccrued([rewardToken.address], dave.address, [
          pool.address,
        ]);
      expect(rewards[0]).to.be.not.equal(0);

      //rewards off
      await syntheX
        .connect(bob)
        .setPoolSpeed(rewardToken.address, pool.address, 0, false);
      const rewardsAfterOff = await syntheX
        .connect(dave)
        .callStatic.getRewardsAccrued([rewardToken.address], dave.address, [
          pool.address,
        ]);
      expect(rewardsAfterOff[0]).to.be.gt(rewards[0]);

      //3 days
      await time.increase(60 * 60 * 24 * 3);

      //repay debt
      await synth.connect(dave).burn(parseEther("50"));
      const rewardsAfterBurn = await syntheX
        .connect(dave)
        .callStatic.getRewardsAccrued([rewardToken.address], dave.address, [
          pool.address,
        ]);
      expect(rewardsAfterBurn[0]).to.be.equal(rewardsAfterOff[0]);

      //claim rewards
      expect(await rewardToken.balanceOf(dave.address)).to.be.equal(0);
      await syntheX
        .connect(dave)
        .claimReward([rewardToken.address], dave.address, [pool.address]);
      expect(await rewardToken.balanceOf(dave.address)).to.be.equal(
        rewardsAfterOff[0]
      );
    });

    it("Should get rewards if rewards on after deposit and before repay", async () => {
      //rewards off
      await syntheX
        .connect(bob)
        .setPoolSpeed(rewardToken.address, pool.address, 0, false);

      //check rewards
      const rewardsBefore = await syntheX.callStatic.getRewardsAccrued(
        [rewardToken.address],
        dave.address,
        [pool.address]
      );
      expect(rewardsBefore[0]).to.be.equal(0);

      //deposit collateral
      await collateral.connect(dave).approve(pool.address, parseEther("100"));
      await pool.connect(dave).deposit(collateral.address, parseEther("100"));

      //issue debt
      await synth
        .connect(dave)
        .mint(parseEther("100"), dave.address, ZERO_ADDRESS);

      //3 days
      await time.increase(60 * 60 * 24 * 3);

      //check rewards
      const rewardsAfterDeposit = await syntheX.callStatic.getRewardsAccrued(
        [rewardToken.address],
        dave.address,
        [pool.address]
      );
      expect(rewardsAfterDeposit[0]).to.be.eq(0);

      //rewards on
      const speed = parseEther("0.0000001");
      await syntheX
        .connect(bob)
        .setPoolSpeed(rewardToken.address, pool.address, speed, false);

      //3 days
      await time.increase(60 * 60 * 24 * 3);

      //check rewards
      const rewardsAfterOn = await syntheX.callStatic.getRewardsAccrued(
        [rewardToken.address],
        dave.address,
        [pool.address]
      );
      expect(rewardsAfterOn[0]).to.be.gt(0);

      //repay debt
      await synth.connect(dave).burn(parseEther("60"));

      //check rewards
      const rewardsAfterBurn = await syntheX
        .connect(dave)
        .callStatic.getRewardsAccrued([rewardToken.address], dave.address, [
          pool.address,
        ]);
      expect(rewardsAfterBurn[0]).to.be.gt(rewardsAfterOn[0]);

      //claim rewards
      expect(await rewardToken.balanceOf(dave.address)).to.be.equal(0);
      await syntheX
        .connect(dave)
        .claimReward([rewardToken.address], dave.address, [pool.address]);
      expect(await rewardToken.balanceOf(dave.address)).to.be.closeTo(
        rewardsAfterBurn[0],
        speed
      );
    });

    it.skip("Should issue debt correctly", async () => {
      //deposit collateral
      await collateral.connect(dave).approve(pool.address, parseEther("10"));
      await pool.connect(dave).deposit(collateral.address, parseEther("10"));

      //issue debt
      await synth
        .connect(dave)
        .mint(parseEther("10"), dave.address, ZERO_ADDRESS);

      console.log(await pool.balanceOf(dave.address)); //8
      console.log(await synth.balanceOf(dave.address)); //7,9
      console.log(await synth.balanceOf(vault.address)); //0,0007999200079992

      //get balances
      const debtAmount = await pool.balanceOf(dave.address);
      const synthBalance = await synth.balanceOf(dave.address); //don't convert to usd because the price -> 1:1
      const feeAmount = await synth.balanceOf(vault.address);

      //check amounts
      expect(synthBalance.add(feeAmount)).to.be.gt(debtAmount);
    });

    it("Should withdraw collateral amount correctly", async () => {
      const synthAmount = parseEther("10");
      const collateralAmount = parseEther("100");

      //deposit collateral by dave
      await collateral.connect(dave).approve(pool.address, collateralAmount);
      await pool.connect(dave).deposit(collateral.address, collateralAmount);

      //issue debt to dave
      await synth.connect(dave).mint(synthAmount, dave.address, ZERO_ADDRESS);

      //withdraw collateral amount by charlie (charlie has no collateral deposited)
      await expect(
        pool
          .connect(charlie)
          .withdraw(collateral.address, collateralAmount, false)
      ).to.be.revertedWith("9");

      expect((await pool.getAccountLiquidity(charlie.address))[0]).to.be.eq(0);
      expect((await pool.getAccountLiquidity(charlie.address))[1]).to.be.eq(0);

      expect(await collateral.balanceOf(charlie.address)).to.be.eq(
        collateralAmount
      );
      expect(await collateral.balanceOf(dave.address)).to.be.eq(0);

      expect((await pool.getAccountLiquidity(dave.address))[0]).to.be.not.eq(0);
      expect((await pool.getAccountLiquidity(dave.address))[1]).to.be.not.eq(0);

      //withdraw smaller collateral amount by charlie (charlie has no collateral deposited)
      await expect(
        pool
          .connect(charlie)
          .withdraw(collateral.address, collateralAmount.div(2), false)
      ).to.be.revertedWith("9");

      //deposit collateral2 by dave
      await collateral2.connect(dave).approve(pool.address, collateralAmount);
      await pool.connect(dave).deposit(collateral2.address, collateralAmount);

      //issue debt to dave
      await synth.connect(dave).mint(synthAmount, dave.address, ZERO_ADDRESS);

      //withdraw smaller collateral2 amount by charlie (charlie has no collateral2 deposited)
      await expect(
        pool
          .connect(charlie)
          .withdraw(collateral2.address, collateralAmount.div(3), false)
      ).to.be.revertedWith("9");

      //withdraw collateral2 amount by charlie (charlie has no collateral2 deposited)
      await expect(
        pool
          .connect(charlie)
          .withdraw(collateral2.address, collateralAmount, false)
      ).to.be.revertedWith("9");

      //deposit collateral by charlie
      await collateral.connect(charlie).approve(pool.address, collateralAmount);
      await pool.connect(charlie).deposit(collateral.address, collateralAmount);

      //issue debt to charlie
      await synth
        .connect(charlie)
        .mint(synthAmount, charlie.address, ZERO_ADDRESS);

      //withdraw collateral2 by charlie (charlie has no collateral2 deposited)
      await expect(
        pool
          .connect(charlie)
          .withdraw(collateral2.address, collateralAmount, false)
      ).to.be.revertedWith("9");

      // withdraw collateral by charlie
      const withdrawAmountCharlie = (
        await pool.getAccountLiquidity(charlie.address)
      )[0];

      await expect(
        pool
          .connect(charlie)
          .withdraw(collateral.address, withdrawAmountCharlie, false)
      )
        .to.emit(pool, "Withdraw")
        .withArgs(charlie.address, collateral.address, withdrawAmountCharlie);

      expect(await collateral.balanceOf(charlie.address)).to.be.eq(
        withdrawAmountCharlie
      );
      expect(await collateral2.balanceOf(charlie.address)).to.be.eq(
        collateralAmount
      );

      // expect((await pool.getAccountLiquidity(charlie.address))[0]).to.be.eq(0); //13.9
      // expect((await pool.getAccountLiquidity(charlie.address))[1]).to.be.eq(0); //30

      expect(await collateral.balanceOf(dave.address)).to.be.eq(0);
      expect(await collateral2.balanceOf(dave.address)).to.be.eq(0);

      //withdraw collateral2 by dave
      const withdrawAmountDave = collateralAmount;
      await expect(
        pool
          .connect(dave)
          .withdraw(collateral2.address, withdrawAmountDave, false)
      )
        .to.emit(pool, "Withdraw")
        .withArgs(dave.address, collateral2.address, withdrawAmountDave);

      expect(await collateral.balanceOf(dave.address)).to.be.eq(0);
      expect(await collateral2.balanceOf(dave.address)).to.be.eq(
        withdrawAmountDave
      );

      //withdraw collateral2 by dave again
      await expect(
        pool
          .connect(dave)
          .withdraw(collateral2.address, withdrawAmountDave, false)
      ).to.be.revertedWith("9");

      //withdraw collateral by dave
      const withdrawAmountDaveLiq = (
        await pool.getAccountLiquidity(dave.address)
      )[0];

      await expect(
        pool
          .connect(dave)
          .withdraw(collateral.address, withdrawAmountDaveLiq, false)
      )
        .to.emit(pool, "Withdraw")
        .withArgs(dave.address, collateral.address, withdrawAmountDaveLiq);

      expect(await collateral.balanceOf(dave.address)).to.be.eq(
        withdrawAmountDaveLiq
      );
      expect(await collateral2.balanceOf(dave.address)).to.be.eq(
        collateralAmount
      );
      expect(await collateral.balanceOf(charlie.address)).to.be.eq(
        withdrawAmountCharlie
      );
      expect(await collateral2.balanceOf(charlie.address)).to.be.eq(
        collateralAmount
      );
    });

    it("Should burn debt correctly", async () => {
      const synthAmount = parseEther("10");
      const collateralAmount = parseEther("20");

      //deposit collateral by dave
      await collateral.connect(dave).approve(pool.address, collateralAmount);
      await pool.connect(dave).deposit(collateral.address, collateralAmount);

      //issue debt to dave
      await synth.connect(dave).mint(synthAmount, dave.address, ZERO_ADDRESS);
      
      //increase time to 33 days
      await time.increase(86400 * 33);

      expect(await synth.balanceOf(dave.address)).to.be.equal(synthAmount);
      // expect(await pool.getUserDebtUSD(dave.address)).to.be.equal(synthAmount); //10.0005
      
      //burn debt by dave
      await synth.connect(dave).burn(synthAmount);

      // expect(await pool.getUserDebtUSD(dave.address)).to.be.eq(0); //0.000999
      expect(await synth.balanceOf(dave.address)).to.be.eq(0);
      
      //issue debt to dave
      await synth.connect(dave).mint(synthAmount, dave.address, ZERO_ADDRESS);
      
      //increase time to 33 days
      await time.increase(86400 * 33);

      // expect(await pool.getUserDebtUSD(dave.address)).to.be.equal(synthAmount); //10.00149995
      expect(await synth.balanceOf(dave.address)).to.be.equal(synthAmount);
      const daveDebt = await pool.getUserDebtUSD(dave.address);

      //burn invalid debt by dave
      await expect(synth.connect(dave).burn((synthAmount).add(265))).to.be.revertedWith('ERC20: burn amount exceeds balance');
      
      expect(await pool.getUserDebtUSD(dave.address)).to.be.equal(daveDebt);
      
      //burn second debt by dave
      await synth.connect(dave).burn((synthAmount));

      // expect(await pool.getUserDebtUSD(dave.address)).to.be.eq(0); //0.0019999
    });
  });
});
