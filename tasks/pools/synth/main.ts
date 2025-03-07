import hre, { ethers, upgrades } from 'hardhat';
import fs from 'fs';
import { _deploy } from '../../../scripts/utils/helper';
import { _deploy as _deployDefender } from '../../../scripts/utils/defender';
import { Contract } from 'ethers';
import { SynthArgs } from '../../../deployments/types';

export default async function main(synthConfig: SynthArgs, poolAddress: string, oracleAddress: string, isTest: boolean = false): Promise<{synth: Contract, feed: Contract}> {
	// read deployments and config
	const deployments = JSON.parse(fs.readFileSync(process.cwd() + `/deployments/${hre.network.config.chainId}/deployments.json`, "utf8"));
	const config = JSON.parse(fs.readFileSync(process.cwd() + `/deployments/${hre.network.config.chainId}/config.json`, "utf8"));
	
	const [deployer] = await ethers.getSigners();

    // get synthex contract
    const synthexAddress = deployments.contracts["SyntheX"].address;
    const SyntheX = await ethers.getContractFactory("SyntheX");
    const synthex = SyntheX.attach(synthexAddress);

	// get pool contract
	const Pool = await ethers.getContractFactory("Pool");
	const pool = Pool.attach(poolAddress);
	const poolName = await pool.name();
	const poolSymbol = await pool.symbol();

	// get oracle address
	const oracle = await ethers.getContractAt('PriceOracle', oracleAddress);
	
	let synth: string|Contract = synthConfig.address as string;
	if(!synth){
		const symbol = poolSymbol.toLowerCase() + synthConfig.symbol;
		const name = 'SyntheX ' + synthConfig.name + ' (' + poolName + ')';
		// deploy token
		synth = await _deploy('ERC20X', [name, symbol, poolAddress, synthex.address], deployments, { name: symbol, upgradable: true }, config);
		if(!isTest) console.log(`Token ${name} (${symbol}) deployed at ${synth.address}`);
	} else {
		synth = await ethers.getContractAt('ERC20X', synth);
	}
	let feed: string|Contract = synthConfig.feed as string;

	if(synthConfig.isFeedSecondary){
		// deploy secondary price feed
		feed = await _deploy('SecondaryOracle', [feed, synthConfig.secondarySource], deployments, {name: `${synthConfig.symbol}_PriceFeed`});
		if(!isTest) console.log(`Secondary price feed deployed at ${feed.address}`);
		feed = feed.address;
	}
	if(!feed){
		if(!synthConfig.price) throw new Error('Price not set for ' + synthConfig.symbol);
		// deploy price feed
		feed = await _deploy('MockPriceFeed', [ethers.utils.parseUnits(synthConfig.price, 8), 8], deployments, {name: `${synthConfig.symbol}_PriceFeed`});
		if(!isTest) console.log(`Price feed deployed at ${feed.address}`);
	} else {
		feed = await ethers.getContractAt('MockPriceFeed', feed);
	}
	// set price feed
	await oracle.setAssetSources([synth.address], [feed.address]);

	await pool.addSynth(synth.address, synthConfig.mintFee, synthConfig.burnFee);
	if(!isTest) console.log(`\t\t ${synthConfig.name} (${synthConfig.symbol}) ($${parseFloat(ethers.utils.formatUnits(await feed.latestAnswer(), await feed.decimals())).toFixed(4)}) added  ✨`);

	if(synthConfig.isFeeToken){
		await pool.setFeeToken(synth.address);
		if(!isTest) console.log(`${synthConfig.name} (${synthConfig.symbol}) set as Fee Token ✅`);
	}

	return {synth, feed};
}