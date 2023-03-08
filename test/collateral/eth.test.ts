import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { ETH_ADDRESS } from "../../scripts/utils/const";
import main from "../../scripts/main";

describe("Rewards", function () {
	let synthex: any,
		weth: any,
		sealedSyn: any,
		oracle: any,
		cryptoPool: any,
		eth: any,
		susd: any,
		sbtc: any,
		seth: any,
		pool2;
	let owner: any, user1: any, user2: any, user3: any;

	beforeEach(async () => {
		// Contracts are deployed using the first signer/account by default
		[owner, user1, user2] = await ethers.getSigners();

		const deployments = await loadFixture(main);
		synthex = deployments.synthex;
		sealedSyn = deployments.sealedSYN;
		oracle = deployments.pools[0].oracle;
		cryptoPool = deployments.pools[0].pool;
		weth = deployments.pools[0].collateralTokens[1];
		sbtc = deployments.pools[0].synths[0];
		seth = deployments.pools[0].synths[1];
		susd = deployments.pools[0].synths[2];
	});

	it("deposit with depositETH", async function () {
        await cryptoPool.connect(user1).depositETH({value: ethers.utils.parseEther("10")});
		expect((await cryptoPool.getAccountLiquidity(user1.address))[1]).eq(
			ethers.utils.parseEther("10000")
		);
	});

	it("deposit by sending eth", async function () {
        await user1.sendTransaction({to: cryptoPool.address, value: ethers.utils.parseEther("10")});
        expect((await cryptoPool.getAccountLiquidity(user1.address))[1]).eq(
            ethers.utils.parseEther("10000")
        );
	});
});
