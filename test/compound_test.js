const { expect } = require('chai')
const { ethers } = require('hardhat')
const helpers = require("@nomicfoundation/hardhat-network-helpers");

let owner, user1, user2;

let tokenA, tokenB;
let myTokenSupplement = ethers.utils.parseUnits("6000000", 18);
let tokenNameA = "tokenA";
let tokenNameB = "tokenB";
let tokenSymbolA = "TA";
let tokenSymbolB = "TB";
let tokenAPrice =  ethers.utils.parseUnits("1", 18);
let tokenBPrice =  ethers.utils.parseUnits("100", 18);

let cTokenA, cTokenB
let cTokenNameA = "cTokenA";
let cTokenNameB = "cTokenB";
let cTokenSymbolA = "CTA";
let cTokenSymbolB = "CTB";
let cTokenChangeRateA = ethers.utils.parseUnits("1", 18);
let cTokenChangeRateB = ethers.utils.parseUnits("1", 18);
let cTokenDecimal = 18;
let collateralFactorA = BigInt(0.9 * 1e18);
let collateralFactorB = BigInt(0.5 * 1e18);

let closeFactor = BigInt(0.5 * 1e18);
let liquidationIncentive = BigInt(1.08 * 1e18);

let comptroller;
let interestRate;
let oracle;

async function initContracts() {
[owner, user1, user2] = await ethers.getSigners();

        // 創立 tokenA, tokenB
        const MyERC20 = await ethers.getContractFactory("MyERC20");
        tokenA = await MyERC20.deploy(myTokenSupplement, tokenNameA, tokenSymbolA);
        await tokenA.deployed();
        tokenB = await MyERC20.deploy(myTokenSupplement, tokenNameB, tokenSymbolB);
        await tokenB.deployed();

        // 建立 comptroller
        const Comptroller = await ethers.getContractFactory("Comptroller");
        comptroller = await Comptroller.deploy();
        await comptroller.deployed();

        // 建立 oracle
        const SimplePriceOracle = await ethers.getContractFactory("SimplePriceOracle");
        oracle = await SimplePriceOracle.deploy();
        await oracle.deployed();

        // 建立 interest Rate
        const InterestRate = await ethers.getContractFactory("WhitePaperInterestRateModel");
        interestRate = await InterestRate.deploy(0, 0);
        await interestRate.deployed();

        // 創立 cTokenA
        const CErc20 = await ethers.getContractFactory("CErc20Immutable");
        cTokenA = await CErc20.deploy(
            tokenA.address,
            comptroller.address,
            interestRate.address,
            cTokenChangeRateA,
            cTokenNameA,
            cTokenSymbolA,
            cTokenDecimal,
            owner.address,
        );
        await cTokenA.deployed();
       
        // 創立 cTokenB
        cTokenB = await CErc20.deploy(
            tokenB.address,
            comptroller.address,
            interestRate.address,
            cTokenChangeRateB,
            cTokenNameB,
            cTokenSymbolB,
            cTokenDecimal,
            owner.address,
        );
        await cTokenB.deployed();

        // 設定 Comptroller
        // set oracle
        await oracle.setUnderlyingPrice(cTokenA.address, tokenAPrice);
        await oracle.setUnderlyingPrice(cTokenB.address, tokenBPrice);
        await comptroller._setPriceOracle(oracle.address);
        // support market
        await comptroller._supportMarket(cTokenA.address);
        await comptroller._supportMarket(cTokenB.address);
        // set collateral
        await comptroller._setCollateralFactor(cTokenA.address, collateralFactorA);
        await comptroller._setCollateralFactor(cTokenB.address, collateralFactorB);
        // set close factor
        await comptroller._setCloseFactor(closeFactor);
        // set liquidation incentive
        await comptroller._setLiquidationIncentive(liquidationIncentive);
}


describe("Mint and Redeen", function(){
    before(async () => {
        await initContracts();
    })

    it ("Mint 100 cTokenA", async function(){ 
        let mintAmount = 100;
        // myERC20 100 轉給 cMyERC20 contract
        await tokenA.approve(cTokenA.address, mintAmount);
        // mint cERC20 100
        await cTokenA.mint(100);
    
        expect(await cTokenA.balanceOf(owner.address)).to.equal(mintAmount);
    })

    it ("Redeem cTokenA 100 back", async function() {
        let mintAmount = 100;
        await cTokenA.redeem(mintAmount);
        
        expect(await cTokenA.balanceOf(owner.address)).to.equal(0);
    })
})


describe("Compound liquidate with adjust collateralFactorB", function(){
    before(async () => {
        await initContracts();
    })
    /*
    User1 使用 1 顆 token B 來 mint cToken
    User1 使用 token B 作為抵押品來借出 50 顆 token A
    */
    describe("Scenario3: owner use 1 tokenB to mint cTokenB, then borrow 50 tokenA", async () => {
        let tokenAmountA = 100;
        let tokenAmountB = 1;
        let user1BorrowTokenAmountA = 50;

        it("owner supply some tokenA for cTokenA", async () => {
            await tokenA.approve(cTokenA.address, tokenAmountA);
            await cTokenA.mint(tokenAmountA);
            expect(await cTokenA.balanceOf(owner.address)).to.eq(tokenAmountA);
        });

        it("user1 mint approve tokenB and mint cTokenB", async () => {
            await tokenB.transfer(user1.address, tokenAmountB);
            await tokenB.connect(user1).approve(cTokenB.address, tokenAmountB);
            await cTokenB.connect(user1).mint(tokenAmountB); // 1:1
            expect(await cTokenB.balanceOf(user1.address)).to.eq(tokenAmountB);
        });

        // In order to supply collateral or borrow in a market, it must be entered first.
        it("enter cTokenB to markets", async () => {
            await comptroller.connect(user1).enterMarkets([cTokenB.address]);
        });

        it("user1 borrow tokenA", async () => {
            await cTokenA.connect(user1).borrow(user1BorrowTokenAmountA);
            let user1BorrowABalance = await cTokenA.connect(user1).callStatic.borrowBalanceCurrent(user1.address);
            expect(user1BorrowABalance).to.eq(user1BorrowTokenAmountA);
        });

        // it("user1 repay tokenA", async () => {
        //     let user1TokenA = await tokenA.balanceOf(user1.address);
        //     expect(user1TokenA).to.eq(user1BorrowTokenAmountA);
        //     await tokenA.connect(user1).approve(cTokenA.address, user1BorrowTokenAmountA);
        //     await cTokenA.connect(user1).repayBorrow(user1BorrowTokenAmountA);
        //     let user1RemainTokenA = await tokenA.balanceOf(user1.address);
        //     expect(user1RemainTokenA).to.eq(0);

        //     //liquidity should grater than 0
        //     let result = await comptroller.getAccountLiquidity(user1.address);
        //     expect(result[1]).to.gt(0);
        // });
    })

    /*
    延續 (3.) 的借貸場景，調整 token B 的 collateral factor，讓 user1 被 owner 清算
    */
    describe("After Scenario3, adjust tokenB collateral factor make user1 be liquidated by owner", async () => {
        let newCollateralFactorB = BigInt(0.4 * 1e18);

        it("adjust tokenB collateranl factor", async () => {
            await comptroller._setCollateralFactor(
                cTokenB.address,
                newCollateralFactorB
            );

            let markets = await comptroller.markets(cTokenB.address);
            expect(markets.collateralFactorMantissa).to.eq(
                newCollateralFactorB
            );
        });

        it("liquidity should = 0 && short fall should > 0", async () => {
            let result = await comptroller.connect(user1).getAccountLiquidity(user1.address);
            expect(result[1]).to.eq(0); // liquidity
            expect(result[2]).to.gt(0); // short fall
        });

        it("liquidate by owner", async () => {
            let borrowBalance = await cTokenA.connect(user1).callStatic.borrowBalanceCurrent(
                user1.address
            );

            let repayAmount =
                (BigInt(borrowBalance) * closeFactor) / BigInt(1e18);

            // owner 協助償還借貸，執行liquidateBorrow
            // 第一個參數為被清算人，第二為協助清算資產數量，第三個為抵押資產的cToken地址
            await tokenA.approve(cTokenA.address, repayAmount);
            await cTokenA.liquidateBorrow(user1.address, repayAmount, cTokenB.address);
        });
    }) 
});


describe("Compound liquidate with adjust oracle", async () => {
    before(async () => {
        await initContracts();
    });

    describe("Scenario3: owner use 1 tokenB to mint cTokenB, then borrow 50 tokenA", async () => {
        let tokenAmountA = 100;
        let tokenAmountB = 1;
        let user1BorrowTokenAmountA = 50;

        it("owner supply some tokenA for cTokenA", async () => {
            await tokenA.approve(cTokenA.address, tokenAmountA);
            await cTokenA.mint(tokenAmountA);
            expect(await cTokenA.balanceOf(owner.address)).to.eq(tokenAmountA);
        });

        it("user1 mint approve tokenB and mint cTokenB", async () => {
            await tokenB.transfer(user1.address, tokenAmountB);
            await tokenB.connect(user1).approve(cTokenB.address, tokenAmountB);
            await cTokenB.connect(user1).mint(tokenAmountB); // 1:1
            expect(await cTokenB.balanceOf(user1.address)).to.eq(tokenAmountB);
        });

        // In order to supply collateral or borrow in a market, it must be entered first.
        it("enter cTokenB to markets", async () => {
            await comptroller.connect(user1).enterMarkets([cTokenB.address]);
        });

        it("user1 borrow tokenA", async () => {
            await cTokenA.connect(user1).borrow(user1BorrowTokenAmountA);
            let user1BorrowABalance = await cTokenA.connect(user1).callStatic.borrowBalanceCurrent(user1.address);
            expect(user1BorrowABalance).to.eq(user1BorrowTokenAmountA);
        });
    })

    describe("After Scenario3, adjust oracle price", async () => {
        let newTokenAPrice = BigInt(1.5 * 1e18);
        it("change tokenA oracle price", async () => {
            await oracle.setUnderlyingPrice(cTokenA.address, newTokenAPrice);
        });

        it("owner liquidity should = 0 && short fall should > 0", async () => {
            let result = await comptroller.getAccountLiquidity(user1.address);
            expect(result[1]).to.eq(0);
            expect(result[2]).to.gt(0);
        });

        it("liquidate by owner", async () => {
            let borrowBalance = await cTokenA.connect(user1).callStatic.borrowBalanceCurrent(
                user1.address
            );

            let repayAmount =
                (BigInt(borrowBalance) * closeFactor) / BigInt(1e18);

            // owner 協助償還借貸，執行liquidateBorrow
            // 第一個參數為被清算人，第二為協助清算資產數量，第三個為抵押資產的cToken地址
            await tokenA.approve(cTokenA.address, repayAmount);
            await cTokenA.liquidateBorrow(user1.address, repayAmount, cTokenB.address);
        });
    });
});
