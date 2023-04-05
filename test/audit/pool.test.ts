import type { SnapshotRestorer } from "@nomicfoundation/hardhat-network-helpers";
import { takeSnapshot } from "@nomicfoundation/hardhat-network-helpers";
import{ time } from "@nomicfoundation/hardhat-network-helpers";
import { ERRORS } from '../../scripts/utils/errors';

import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import type { Pool } from "../../typechain-types";
import type { ERC20Mock } from "../../typechain-types";
import type { OracleMock } from "../../typechain-types";
import type { ERC20X } from "../../typechain-types";
import type { SyntheX } from "../../typechain-types";
import type { WETH9 } from "../../typechain-types";
import { parseEther } from "ethers/lib/utils";
import { BigNumber } from "ethers";
import { draftErc20PermitUpgradeableSol } from "../../typechain-types/factories/@openzeppelin/contracts-upgradeable/token/ERC20/extensions";

const DAY = 24*60*60
const toEther = ethers.utils.formatEther

describe.only("Pool", function () {
    let snapshotA: SnapshotRestorer;

    // Signers.
    let deployer: SignerWithAddress, owner: SignerWithAddress;
    let user_1: SignerWithAddress;
    let user_2: SignerWithAddress;
    let referee: SignerWithAddress;
    let vault: SignerWithAddress;
    let pool: Pool;
    let collateral_1: ERC20Mock;
    let collateral_2: ERC20Mock;
    let paymentToken: ERC20Mock;
    let syntetic_1: ERC20X;
    let syntetic_2: ERC20X;
    let feeToken: ERC20X;
    let weth: WETH9;
    let synteX: SyntheX;
    let oracle: OracleMock;

    let signers, users

    let usersMerkleProofs, leaves, usersAddresses
    
    const COLLATERAL_1_PRICE = 2e8 
    const COLLATERAL_2_PRICE = 10e8 
    const SYNTETIC_1_PRICE = 5e8
    const SYNTETIC_2_PRICE = 8e8

    const FEE_TOKEN_PRICE = 5e8
    const USD_DECIMALS = 1e8
    const BASE_POINTS = 10000

    const VAULT_KECCAK256 = "0x68fc488efe30251cadb6ac88bdeef3f1a5e6048808baf387258d1d78e986720c"
    

    before(async () => {
        // Getting of signers.
        const USER_NUMBER = 10
        signers = await ethers.getSigners();
        deployer = signers[0]
        users = signers.slice(1,USER_NUMBER + 1)
        user_1 = users[0]
        user_2 = users[1]
        referee = signers[USER_NUMBER + 2]
        vault = signers[USER_NUMBER + 3]
    
        const ERC20Mock = await ethers.getContractFactory("ERC20Mock", deployer);
        collateral_1 = await ERC20Mock.deploy()
        await collateral_1.deployed();

        collateral_2 = await ERC20Mock.deploy()
        await collateral_2.deployed();

        const WETH9 = await ethers.getContractFactory("WETH9", deployer);
        weth = await WETH9.deploy()
        await weth.deployed();

        const OracleMock = await ethers.getContractFactory("OracleMock", deployer)
        oracle = await OracleMock.deploy()
        await oracle.deployed()

        paymentToken = await ERC20Mock.deploy()
        await paymentToken.deployed();

        const SyntheX = await ethers.getContractFactory("SyntheX");
        synteX = (await upgrades.deployProxy(SyntheX,
             [deployer.address, deployer.address, deployer.address])) as SyntheX;

        //set vault for Syntex
        await synteX.setAddress(VAULT_KECCAK256, vault.address )

        const Pool = await ethers.getContractFactory("Pool", deployer)
        pool = await upgrades.deployProxy(Pool, [
            "Pool name",    // string memory _name,
            "SMBL",         // string memory _symbol,
            synteX.address, // address _synthex
            weth.address
        ]) as Pool

        const ERC20X = await ethers.getContractFactory("ERC20X", deployer)
        syntetic_1 = await upgrades.deployProxy( ERC20X,
            [
                "ERC20X", // string memory _name,
                "ERC20x",// string memory _symbol,
                pool.address,// address _pool,
                synteX.address// address _synthex
            ],
            { unsafeAllow: ['delegatecall'] }
        ) as ERC20X

        syntetic_2 = await upgrades.deployProxy( ERC20X,
            [
                "ERC20X_2", // string memory _name,
                "ERC20x_2",// string memory _symbol,
                pool.address,// address _pool,
                synteX.address// address _synthex
            ],
            { unsafeAllow: ['delegatecall'] }
        ) as ERC20X

        feeToken = await upgrades.deployProxy( ERC20X,
            [
                "ERC20X_Fee", // string memory _name,
                "ERC20x_Fee",// string memory _symbol,
                pool.address,// address _pool,
                synteX.address// address _synthex
            ],
            { unsafeAllow: ['delegatecall'] }
        ) as ERC20X

        await pool.setFeeToken(feeToken.address)
        await pool.setPriceOracle(oracle.address)
        
        await oracle.setPrice(collateral_1.address, COLLATERAL_1_PRICE)
        await oracle.setPrice(collateral_2.address, COLLATERAL_2_PRICE)
        await oracle.setPrice(syntetic_1.address, SYNTETIC_1_PRICE)
        await oracle.setPrice(syntetic_2.address, SYNTETIC_2_PRICE)
        await oracle.setPrice(feeToken.address, FEE_TOKEN_PRICE)

        snapshotA = await takeSnapshot();
    });

    afterEach(async () => await snapshotA.restore());
      
    describe("enterCollateral", function () {
        it("user can enter collateral", async() =>{
            await pool.updateCollateral(
                collateral_1.address, 
                {
                    isActive : true,
                    cap : parseEther("1000"),
                    totalDeposits : parseEther("1000"),
                    baseLTV : 8000,
                    liqThreshold : 9000,
                    liqBonus : 10000 // 0
                }
            )   

            expect(await pool.connect(user_1).enterCollateral(collateral_1.address))
                .to.emit(pool, "CollateralEntered")
                .withArgs(user_1.address, collateral_1.address)

            expect(await pool.accountMembership(collateral_1.address, user_1.address))
                .to.be.true
        })
        it("user cannot enter collateral twice", async () =>{
            await pool.updateCollateral(
                collateral_1.address, 
                {
                    isActive : true,
                    cap : parseEther("1000"),
                    totalDeposits : parseEther("1000"),
                    baseLTV : 8000,
                    liqThreshold : 9000,
                    liqBonus : 10000 // 0
                }
            )   
            await pool.connect(user_1).enterCollateral(collateral_1.address)
                
            await expect(pool.connect(user_1).enterCollateral(collateral_1.address))
                .to.be.revertedWith("5")   
        })
        it("cannot enter not acitve  collateral", async() =>{
            await expect( pool.connect(user_1).enterCollateral(collateral_1.address))
                .to.be.revertedWith("10")
        })
        it("user can exit collateral with deposited collateral", async() =>{
            await pool.updateCollateral(
                collateral_1.address, 
                {
                    isActive : true,
                    cap : parseEther("1000"),
                    totalDeposits : parseEther("1000"),
                    baseLTV : 8000,
                    liqThreshold : 9000,
                    liqBonus : 10000 // 0
                }
            )   
            //deposit
            const AMOUNT = parseEther("1")
            await collateral_1.mint(user_1.address, AMOUNT )
            await collateral_1.connect(user_1).increaseAllowance(pool.address, AMOUNT)
            await pool.unpause()
            await pool.connect(user_1).deposit(collateral_1.address, AMOUNT)
            expect(await pool.accountCollaterals(user_1.address, 0)).to.be.eq(collateral_1.address)

            await pool.connect(user_1).exitCollateral(collateral_1.address)
            //@dev cannot return empty array from mapping in solidity
            // don't judge me for revert without reason  
            await expect(pool.accountCollaterals(user_1.address, 0)).to.be.reverted 
        })
    })
    describe("deposit", async() =>{
        it("user can deposit ERC20", async() =>{
            await pool.updateCollateral(
                collateral_1.address, 
                {
                    isActive : true,
                    cap : parseEther("1000"),
                    totalDeposits : parseEther("1000"),
                    baseLTV : 8000,
                    liqThreshold : 9000,
                    liqBonus : 10000 // 0
                }
            )   
            await pool.connect(user_1).enterCollateral(collateral_1.address)
            
            const AMOUNT = parseEther("1")
            await collateral_1.mint(user_1.address, AMOUNT )
            await collateral_1.connect(user_1).increaseAllowance(pool.address, AMOUNT)
            await pool.unpause()

            expect(await pool.connect(user_1).deposit(collateral_1.address, AMOUNT))
                .to.emit(pool, "Deposit").withArgs(user_1.address, collateral_1.address, AMOUNT)
            expect(await collateral_1.balanceOf(pool.address)).to.be.eq(AMOUNT)
        })
        it("user can deposit ETH", async() =>{
            await pool.updateCollateral(
                weth.address, 
                {
                    isActive : true,
                    cap : parseEther("1000"),
                    totalDeposits : parseEther("1000"),
                    baseLTV : 8000,
                    liqThreshold : 9000,
                    liqBonus : 10000 // 0
                }
            )   
            const AMOUNT = parseEther("1")

            await pool.unpause()

            expect(await pool.connect(user_1).depositETH({value: AMOUNT}))
                .to.emit(pool, "Deposit").withArgs(user_1.address, weth.address, AMOUNT)
            expect(await weth.balanceOf(pool.address)).to.be.eq(AMOUNT)
        })
        it("user cannot deposit while contract on pause", async() =>{
            const AMOUNT = parseEther("1")
            await collateral_1.mint(user_1.address, AMOUNT )
            await collateral_1.connect(user_1).increaseAllowance(pool.address, AMOUNT)
            await expect(pool.connect(user_1).deposit(collateral_1.address, AMOUNT))
                .to.be.revertedWith("Pausable: paused") 
        })
        it("user can deposit collateral he hasn't entered", async() =>{
            await pool.updateCollateral(
                collateral_1.address, 
                {
                    isActive : true,
                    cap : parseEther("1000"),
                    totalDeposits : parseEther("1000"),
                    baseLTV : 8000,
                    liqThreshold : 9000,
                    liqBonus : 10000 // 0
                }
            )   

            const AMOUNT = parseEther("1")
            await collateral_1.mint(user_1.address, AMOUNT )
            await collateral_1.connect(user_1).increaseAllowance(pool.address, AMOUNT)
            await pool.unpause()

            expect(await pool.connect(user_1).deposit(collateral_1.address, AMOUNT))
                .to.emit(pool, "Deposit").withArgs(user_1.address, collateral_1.address, AMOUNT)
        })
        it("user cannot deposit when collateral has exceeded capacity", async() =>{
            await pool.updateCollateral(
                collateral_1.address, 
                {
                    isActive : true,
                    cap : parseEther("1"),
                    totalDeposits : parseEther("1000"),
                    baseLTV : 8000,
                    liqThreshold : 9000,
                    liqBonus : 10000 // 0
                }
            )   
            const AMOUNT = parseEther("2")
            await collateral_1.mint(user_1.address, AMOUNT )
            await collateral_1.connect(user_1).increaseAllowance(pool.address, AMOUNT)
            await pool.unpause()
            await expect(pool.connect(user_1).deposit(collateral_1.address, AMOUNT))
                .to.be.revertedWith("8")
        })
    })
    describe("withdraw", function () {
        it("user can withdraw collateral", async() =>{
            await pool.updateCollateral(
                collateral_1.address, 
                {
                    isActive : true,
                    cap : parseEther("1000"),
                    totalDeposits : parseEther("1000"),
                    baseLTV : 8000,
                    liqThreshold : 9000,
                    liqBonus : 10000 // 0
                }
            )   

            await pool.connect(user_1).enterCollateral(collateral_1.address)
            
            const AMOUNT = parseEther("1")
            await collateral_1.mint(user_1.address, AMOUNT )
            await collateral_1.connect(user_1).increaseAllowance(pool.address, AMOUNT)
            await pool.unpause()

            await pool.connect(user_1).deposit(collateral_1.address, AMOUNT)
            //
            const UNWRAP = true
            await pool.connect(user_1).withdraw(collateral_1.address, AMOUNT, UNWRAP)

            expect(await collateral_1.balanceOf(user_1.address)).to.be.eq(AMOUNT)
        })
        it("user cannot withdraw collateral he doesn't own", async() =>{
            await pool.updateCollateral(
                collateral_1.address, 
                {
                    isActive : true,
                    cap : parseEther("1000"),
                    totalDeposits : parseEther("1000"),
                    baseLTV : 8000,
                    liqThreshold : 9000,
                    liqBonus : 10000 // 0
                }
            )   
            await pool.connect(user_1).enterCollateral(collateral_1.address)
            
            const AMOUNT = parseEther("1")
            await collateral_1.mint(user_1.address, AMOUNT )
            await collateral_1.connect(user_1).increaseAllowance(pool.address, AMOUNT)
            await pool.unpause()

            await pool.connect(user_1).deposit(collateral_1.address, AMOUNT)
            //
            const UNWRAP = true
            await expect(pool.connect(user_2).withdraw(collateral_1.address, AMOUNT, UNWRAP))
                .to.be.revertedWith("9")
        })
    })
    describe("mint", function () {
        it("user can mint", async() =>{
            //setup collareal
            await pool.updateCollateral(
                collateral_1.address, 
                {
                    isActive : true,
                    cap : parseEther("1000"),
                    totalDeposits : parseEther("1000"),
                    baseLTV : 8000,
                    liqThreshold : 9000,
                    liqBonus : 10000 // 0
                }
            )   
            await pool.connect(user_1).enterCollateral(collateral_1.address)
            const AMOUNT_TO_DEPOSIT = parseEther("1")
            await collateral_1.mint(user_1.address, AMOUNT_TO_DEPOSIT )
            await collateral_1.connect(user_1).increaseAllowance(pool.address, AMOUNT_TO_DEPOSIT)
            await pool.unpause()
            
            //deposit collateral
            await pool.connect(user_1).deposit(collateral_1.address, AMOUNT_TO_DEPOSIT)
                
            const MINT_FEE = 0
            const BURN_FEE = 0
            await pool.addSynth(syntetic_1.address, MINT_FEE, BURN_FEE)

            const AMOUNT = parseEther("100000")
            const RECIPIENT = user_1.address
                        
            await syntetic_1.connect(user_1).mint(AMOUNT, RECIPIENT, referee.address)
        })
        it("cannot mint with insufficient  user collateral", async() =>{
            await pool.unpause()
            const MINT_FEE = 0
            const BURN_FEE = 0
            await pool.addSynth(syntetic_1.address, MINT_FEE, BURN_FEE)

            const AMOUNT = parseEther("1")
            const RECIPIENT = user_1.address
            const REFERED_BY = ethers.constants.AddressZero
            
            await expect(syntetic_1.connect(user_1).mint(AMOUNT, RECIPIENT, REFERED_BY))
                .to.be.revertedWith("6") 
        })
    })
    describe("getAccountLiquidity", function() {
        it("getAccountLiquidity", async() =>{
            const BASE_LTV = 8000
            
            await pool.updateCollateral(
                collateral_1.address, 
                {
                    isActive : true,
                    cap : parseEther("1000"),
                    totalDeposits : parseEther("1000"),
                    baseLTV : BASE_LTV,
                    liqThreshold : 9000,
                    liqBonus : 10000 // 0
                }
            )   

            await pool.connect(user_1).enterCollateral(collateral_1.address)
            
            const AMOUNT = parseEther("1")
            await collateral_1.mint(user_1.address, AMOUNT )
            await collateral_1.connect(user_1).increaseAllowance(pool.address, AMOUNT)
            await pool.unpause()

            await pool.connect(user_1).deposit(collateral_1.address, AMOUNT)
                
            // console.log("accountCollateralBalance",
            //     ethers.utils.formatEther(await pool.accountCollateralBalance(user.address, erc20.address))
            // )
            
            // console.log("accountCollateralBalance calculated",
            //     ethers.utils.formatEther(AMOUNT.mul(ERC_20_PRICE).div(USD_DECIMALS))
            // )

            let res = await pool.getAccountLiquidity(user_1.address)
            
            expect(ethers.utils.formatEther(res.collateral))
                .to.be.eq(ethers.utils.formatEther(
                    AMOUNT
                        .mul(COLLATERAL_1_PRICE).div(USD_DECIMALS)
                )
                )

            expect(res.liquidity)
                .to.be.eq(
                    AMOUNT
                        .mul(BASE_LTV).div(BASE_POINTS)
                        .mul(COLLATERAL_1_PRICE).div(USD_DECIMALS)
                )
            // int256 liquidity;
            // uint256 collateral;
            // uint256 debt;
        })
    })
    describe("add/remove synth", function() {
        it("add synth", async() =>{
            const MINT_FEE = 0
            const BURN_FEE = 0
            await pool.addSynth(syntetic_1.address, MINT_FEE, BURN_FEE)
            expect(await pool.synthsList(0)).to.be.eq(syntetic_1.address)
        })
        it("add 2 synths", async() =>{
            const MINT_FEE = 0
            const BURN_FEE = 0
            await pool.addSynth(syntetic_1.address, MINT_FEE, BURN_FEE)
            await pool.addSynth(syntetic_2.address, MINT_FEE, BURN_FEE)
            
            expect(await pool.synthsList(0)).to.be.eq(syntetic_1.address)
            expect(await pool.synthsList(1)).to.be.eq(syntetic_2.address)
            
        })
        it("cannot add same synth twice", async() =>{
            const MINT_FEE = 0
            const BURN_FEE = 0
            await pool.addSynth(syntetic_1.address, MINT_FEE, BURN_FEE)
            await expect(pool.addSynth(syntetic_1.address, MINT_FEE, BURN_FEE))
                .to.be.revertedWith("10") 
        })
        it("only L1 admin can add synth", async() =>{
            const MINT_FEE = 0
            const BURN_FEE = 0
            await expect(pool.connect(user_1).addSynth(syntetic_1.address, MINT_FEE, BURN_FEE))
                .to.be.revertedWith("2")  
        })
        it("remove synth number 1 out of 1", async() =>{
            const MINT_FEE = 0
            const BURN_FEE = 0
            await pool.addSynth(syntetic_1.address, MINT_FEE, BURN_FEE)
            
            
            await expect(pool.removeSynth(syntetic_1.address))
                .to.emit(pool, "SynthRemoved").withArgs(syntetic_1.address)
            await expect(pool.synthsList(0)).to.be.reverted
        })
        it("remove synth number 2 out of 2", async() =>{
            const MINT_FEE = 0
            const BURN_FEE = 0
            await pool.addSynth(syntetic_1.address, MINT_FEE, BURN_FEE)
            await pool.addSynth(syntetic_2.address, MINT_FEE, BURN_FEE)
            
            await expect( pool.removeSynth(syntetic_2.address))
                .to.emit(pool, "SynthRemoved").withArgs(syntetic_2.address)
        })
        it("only L1 admin can remove synth", async() =>{
            const MINT_FEE = 0
            const BURN_FEE = 0
            await pool.addSynth(syntetic_1.address, MINT_FEE, BURN_FEE)
            await expect(pool.connect(user_1).removeSynth(syntetic_1.address))
                .to.be.revertedWith("2")  
        })

    })
    describe("commitSwap", function(){
        it("commitSwap one synth for anoter synth", async () =>{
            //setup collareals
            const BASE_LTV = 8000 // 80%
            await pool.updateCollateral(
                collateral_1.address, 
                {
                    isActive : true,
                    cap : parseEther("1000"),
                    totalDeposits : parseEther("1000"),
                    baseLTV : BASE_LTV,
                    liqThreshold : 9000,
                    liqBonus : 10000 // 0
                }
            )   
            await pool.updateCollateral(
                collateral_2.address, 
                {
                    isActive : true,
                    cap : parseEther("1000"),
                    totalDeposits : parseEther("1000"),
                    baseLTV : BASE_LTV,
                    liqThreshold : 9000,
                    liqBonus : 10000 // 0
                }
            )  
            //mint collateral
            const AMOUNT_COLLATERAL_1 = parseEther("1")
            const AMOUNT_COLLATERAL_2 = parseEther("5")

            await pool.connect(user_1).enterCollateral(collateral_1.address)
            await collateral_1.mint(user_1.address, AMOUNT_COLLATERAL_1 )
            await collateral_1.connect(user_1).increaseAllowance(pool.address, AMOUNT_COLLATERAL_1)
            
            await pool.connect(user_1).enterCollateral(collateral_2.address)
            await collateral_2.mint(user_1.address, AMOUNT_COLLATERAL_2 )
            await collateral_2.connect(user_1).increaseAllowance(pool.address, AMOUNT_COLLATERAL_2)
            
            await pool.unpause()

            

            //add synth
            const MINT_FEE = 0
            const BURN_FEE = 0
            await pool.addSynth(syntetic_1.address, MINT_FEE, BURN_FEE)
            await pool.addSynth(syntetic_2.address, MINT_FEE, BURN_FEE)

            const AMOUNT = parseEther("100000") // if more that max will mint max
            
            const RECIPIENT = user_1.address
            
            //deposit and mint collaterals
            
            await pool.connect(user_1).deposit(collateral_1.address, AMOUNT_COLLATERAL_1)                                      
            await syntetic_1.connect(user_1).mint(AMOUNT, RECIPIENT, referee.address)
            await pool.connect(user_1).deposit(collateral_2.address, AMOUNT_COLLATERAL_2)
            await syntetic_2.connect(user_1).mint(AMOUNT, RECIPIENT, referee.address)

            // console.log("debt = ", toEther(await pool.balanceOf(user_1.address))) //debt
            // console.log("synth1 =", toEther(await syntetic_1.balanceOf(user_1.address)))
            // console.log("synth2 =", toEther(await syntetic_2.balanceOf(user_1.address)))

            expect(toEther(await syntetic_1.balanceOf(user_1.address)))
                .to.be.eq(
                    toEther(
                        AMOUNT_COLLATERAL_1.mul(COLLATERAL_1_PRICE)
                        .mul(BASE_LTV).div(BASE_POINTS)
                        .div(SYNTETIC_1_PRICE)
                    )
                )
            expect(toEther(await syntetic_2.balanceOf(user_1.address)))
                .to.be.eq(
                    toEther(
                        AMOUNT_COLLATERAL_2.mul(COLLATERAL_2_PRICE)
                        .mul(BASE_LTV).div(BASE_POINTS)
                        .div(SYNTETIC_2_PRICE)
                        )
                )
            // commit swap
            const SYNTETIC_1_BALANCE_BEFORE = await syntetic_1.balanceOf(user_1.address)
            const SYNTETIC_2_BALANCE_BEFORE = await syntetic_2.balanceOf(user_1.address)

            await syntetic_1.connect(user_1)
                .swap(SYNTETIC_1_BALANCE_BEFORE, syntetic_2.address, user_1.address, referee.address)

            // console.log("synth1 =", toEther(await syntetic_1.balanceOf(user_1.address)))
            // console.log("synth2 =", toEther(await syntetic_2.balanceOf(user_1.address)))
            

            const SYNTETIC_SWAPED_TOKENS = SYNTETIC_1_BALANCE_BEFORE.mul(SYNTETIC_1_PRICE).div(SYNTETIC_2_PRICE)

            expect(await syntetic_1.balanceOf(user_1.address))
                .to.be.eq(0)
            expect(await syntetic_2.balanceOf(user_1.address))
                .to.be.eq(SYNTETIC_2_BALANCE_BEFORE.add(SYNTETIC_SWAPED_TOKENS))
        })
        it("cannot commitswap disabled synth", async () =>{
            await pool.unpause()
            await expect(pool.connect(user_1).commitSwap(user_1.address, parseEther("1"), syntetic_2.address ))
                .to.be.revertedWith(ERRORS.ASSET_NOT_ENABLED)
        })
        it("only synth can call commitswap", async () =>{
            await pool.unpause()
            await expect(pool.connect(user_1).commitSwap(user_1.address, parseEther("1"), syntetic_2.address ))
                .to.be.revertedWith(ERRORS.ASSET_NOT_ENABLED)
        })
    })
    describe("commitLiquidate", function() {
        it("commitLiquidate", async () =>{
            const BASE_LTV = 8000
            await pool.updateCollateral(
                collateral_1.address, 
                {
                    isActive : true,
                    cap : parseEther("1000"),
                    totalDeposits : parseEther("1000"),
                    baseLTV : BASE_LTV,
                    liqThreshold : 9000,
                    liqBonus : 10000 // 0
                }
            )   

            await pool.connect(user_1).enterCollateral(collateral_1.address)
            
            const COLLATERAL_AMOUNT_USER_1 = parseEther("1")
            const COLLATERAL_AMOUNT_USER_2 = parseEther("10")
            await collateral_1.mint(user_1.address, COLLATERAL_AMOUNT_USER_1)
            await collateral_1.mint(user_2.address, COLLATERAL_AMOUNT_USER_2 )
            await collateral_1.connect(user_1).increaseAllowance(pool.address, COLLATERAL_AMOUNT_USER_1)
            await collateral_1.connect(user_2).increaseAllowance(pool.address, COLLATERAL_AMOUNT_USER_2)
            await pool.unpause()

            //add synth
            const MINT_FEE = 0
            const BURN_FEE = 0
            await pool.addSynth(syntetic_1.address, MINT_FEE, BURN_FEE)
            const SINTETIC_MINT_AMOUNT = parseEther("9999999") 
            const RECIPIENT = user_1.address

            console.log("user_1 collateral 1 balance=", toEther(await collateral_1.balanceOf(user_1.address)))    
            console.log("user_2 collateral 1 balance=", toEther(await collateral_1.balanceOf(user_2.address)))   

            await pool.connect(user_1).deposit(collateral_1.address, COLLATERAL_AMOUNT_USER_1)
            await pool.connect(user_2).deposit(collateral_1.address, COLLATERAL_AMOUNT_USER_2)
            await syntetic_1.connect(user_1).mint(SINTETIC_MINT_AMOUNT, user_1.address, referee.address)
            await syntetic_1.connect(user_2).mint(SINTETIC_MINT_AMOUNT, user_2.address, referee.address)
            console.log(toEther(await syntetic_1.balanceOf(user_1.address)))
            console.log(toEther(await syntetic_1.balanceOf(user_2.address)))

            //reduce collateral price at oracle for 12%
            await oracle.setPrice(collateral_1.address, COLLATERAL_1_PRICE * 0.88)

            console.log("user_1 collateral 1 balance=", toEther(await collateral_1.balanceOf(user_1.address)))    
            console.log("user_2 collateral 1 balance=", toEther(await collateral_1.balanceOf(user_2.address)))      

            const AMOUNT_TO_LIQUDATE = parseEther("0.32")
            await syntetic_1.connect(user_2).liquidate(user_1.address, AMOUNT_TO_LIQUDATE, collateral_1.address)

            console.log("user_1 synt balance =",toEther(await syntetic_1.balanceOf(user_1.address)))
            console.log("user_2 synt balance =",toEther(await syntetic_1.balanceOf(user_2.address)))

            console.log("user_1 collateral 1 balance=", toEther(await collateral_1.balanceOf(user_1.address)))    
            console.log("user_2 collateral 1 balance=", toEther(await collateral_1.balanceOf(user_2.address)))    
            
        })
    })
    
})