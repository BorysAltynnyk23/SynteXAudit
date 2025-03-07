import hre, { ethers, upgrades } from 'hardhat';
import fs from 'fs';
import { _deploy } from '../../scripts/utils/helper';
import { _deploy as _deployDefender } from '../../scripts/utils/defender';
import { Contract } from 'ethers';


export default async function main(isTest: boolean = false): Promise<Contract> {
    if(!isTest) console.log(`Deploying SyntheX to ${hre.network.name} (${hre.network.config.chainId}) ...`);

	// read deployments and config
	const deployments = JSON.parse(fs.readFileSync(process.cwd() + `/deployments/${hre.network.config.chainId}/deployments.json`, "utf8"));
	const config = JSON.parse(fs.readFileSync(process.cwd() + `/deployments/${hre.network.config.chainId}/config.json`, "utf8"));
	
	const [deployer] = await ethers.getSigners();

    const args = [deployer.address, deployer.address, deployer.address];

    // deploy synthex
    const synthex = await _deploy("SyntheX", args, deployments, {upgradable: true}, config) as Contract;

    if(!isTest) console.log(`SyntheX deployed at ${synthex.address}`);
    if((hre.network.config as any).isLive){
        try{
            await hre.run("verify:verify", {
                address: synthex.address,
                constructorArguments: []
            })
        } catch (err) {
            console.log("Could not verify SyntheX");
        }
    } else {
        await _deploy("Multicall2", [], deployments);
    }

    _deployDefender("SyntheX" +'_'+ config.version, synthex);
    
    // save deployments
    if(!isTest){
        fs.writeFileSync(
            process.cwd() + `/deployments/${hre.network.config.chainId}/config.json`,
            JSON.stringify(config, null, 2)
        );
        fs.writeFileSync(
            process.cwd() + `/deployments/${hre.network.config.chainId}/deployments.json`,
            JSON.stringify(deployments, null, 2)
        );
    }

    return synthex;
}

