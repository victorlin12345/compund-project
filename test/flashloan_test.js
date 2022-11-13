// cToken 的 decimals 皆為 18，初始 exchangeRate 為 1:1 (ok)
// Close factor 設定為 50%
// Liquidation incentive 設為 10%（1.1 * 1e18)
// 使用 USDC 以及 UNI 代幣來作為 token A 以及 Token B
// 在 Oracle 中設定 USDC 的價格為 $1，UNI 的價格為 $10
// 設定 UNI 的 collateral factor 為 50%

const { expect } = require('chai');
const { ethers } = require('hardhat');
const { impersonateAccount } = require("@nomicfoundation/hardhat-network-helpers");

// below is proxy address, implementation contract: https://etherscan.io/address/0x0882477e7895bdC5cea7cB1552ed914aB157Fe56#code
const usdcAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"; 
// https://etherscan.io/address/0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984#code
const uniAddress = "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984";
let uni;
let usdc;
let tokenAPrice = BigInt(1 * 1e18) * BigInt(1e12);
let tokenBPrice = BigInt(10 * 1e18);

let comptroller
let oracle
let interestRate

let cTokenChangeRateA = BigInt(1 * 1e6);
let cTokenChangeRateB = BigInt(1 * 1e18);
let collateralFactorA = BigInt(0.9 * 1e18);
let collateralFactorB = BigInt(0.5 * 1e18);
let cTokenA;
let cTokenB;
let liquidationIncentive = BigInt(1.1 * 1e18);
let closeFactor = BigInt(0.5 * 1e18);

const bianceAddress = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
let user1;
let user2;

const uniswapRouter = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
const aaveAddress = "0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5";



async function initContracts() {
    [owner, user1, user2] = await ethers.getSigners();

    // UNI, USDC
    usdc = await ethers.getContractAt("MyERC20", usdcAddress);
    uni = await ethers.getContractAt("MyERC20", uniAddress);
    
    // 建立 comptroller
    const Comptroller = await ethers.getContractFactory("Comptroller");
    comptroller = await Comptroller.deploy();
    await comptroller.deployed();

    // 設定 oracle
    const Oracle = await ethers.getContractFactory("SimplePriceOracle");
    oracle = await Oracle.deploy();

    // 設定 interest rate model
    const InterestRate = await ethers.getContractFactory("WhitePaperInterestRateModel");
    interestRate = await InterestRate.deploy(0, 0);

   // 創立 cTokenA (USDC)
   const CErc20 = await ethers.getContractFactory("CErc20Immutable");
   cTokenA = await CErc20.deploy(
      usdcAddress,
      comptroller.address,
      interestRate.address,
      cTokenChangeRateA,
      "USDC",
      "USDC",
      18,
      owner.address,
   );
   await cTokenA.deployed();
  
   // 創立 cTokenB (UNI)
   cTokenB = await CErc20.deploy(
    uniAddress,
    comptroller.address,
    interestRate.address,
    cTokenChangeRateB,
    "UNI",
    "UNI",
    18,
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


// User1 使用 1000 顆 UNI 作為抵押品借出 5000 顆 USDC
// 將 UNI 價格改為 $6.2 使 User1 產生 Shortfall，並讓 User2 透過 AAVE 的 Flash loan 來清算 User1
// 可以自行檢查清算 50% 後是不是大約可以賺 121 USD
// 在合約中如需將 UNI 換成 USDC 可以使用以下程式碼片段：
describe("Flash Loan", async () => {
    before(async () => {
      await initContracts();
    });

    it("Transfer 1000 UNI from biance to user1", async () => {
        const uniSAmount = BigInt(1000 * 1e18);

        let balance = await uni.balanceOf(bianceAddress);
        expect(balance).to.gt(uniSAmount);

        await impersonateAccount(bianceAddress);
        binance = await ethers.getSigner(bianceAddress);
        uni.connect(binance).transfer(user1.address,uniSAmount);

        expect(await uni.balanceOf(user1.address)).to.eq(uniSAmount);
    });

    it("Transfer 5000 USDC from biance to user2", async () => {
        const usdcSAmount = BigInt(5000 * 1e6);
        
        let balance = await uni.balanceOf(bianceAddress);
        expect(balance).to.gt(usdcSAmount);

        await impersonateAccount(bianceAddress);
        binance = await ethers.getSigner(bianceAddress);
        usdc.connect(binance).transfer(user2.address, usdcSAmount);

        expect(await usdc.balanceOf(user2.address)).to.eq(usdcSAmount);
    });

    it("Transfer 10000 USDC from biance to owner", async () => {
        const usdcSAmount = BigInt(10000 * 1e6);
        
        let balance = await usdc.balanceOf(bianceAddress);
        expect(balance).to.gt(usdcSAmount);

        await impersonateAccount(bianceAddress);
        binance = await ethers.getSigner(bianceAddress);
        usdc.connect(binance).transfer(owner.address, usdcSAmount);

        expect(await usdc.balanceOf(owner.address)).to.eq(usdcSAmount);
    });

    it("Owner supply/mint 10000 cTokenA(USDC)", async () => {
        const mintUSDCSAmount = BigInt(10000 * 1e6);
        await usdc.approve(cTokenA.address, mintUSDCSAmount);
        await cTokenA.mint(mintUSDCSAmount);
        expect(await cTokenA.balanceOf(owner.address)).to.eq(mintUSDCSAmount * BigInt(1 * 1e12));
    });

    it("User1 mint 1000 cTokenB(UNI)", async () => {
        const mintUNISAmount = BigInt(1000 * 1e18);
        await uni.connect(user1).approve(cTokenB.address, mintUNISAmount);
        await cTokenB.connect(user1).mint(mintUNISAmount); // 1:1
        expect(await cTokenB.balanceOf(user1.address)).to.eq(mintUNISAmount);
    });

    // In order to supply collateral or borrow in a market, it must be entered first.
    it("User1 enter cTokenB(UNI) [collateral] to markets", async () => {
        await comptroller.connect(user1).enterMarkets([cTokenB.address]);
    });

    it("User1 Borrow 5000 USDC", async () => {
        const borrowedUSDCSAomunt = BigInt(5000 * 1e6);
        await cTokenA.connect(user1).borrow(borrowedUSDCSAomunt);
        let user1Balance = await cTokenA.connect(user1).callStatic.borrowBalanceCurrent(user1.address);
        expect(user1Balance).to.eq(borrowedUSDCSAomunt);
    });
  
    it("change UNI oracle price", async () => {
        const newUNIPrice = BigInt(6.2 * 1e18);
        await oracle.setUnderlyingPrice(cTokenB.address, newUNIPrice);
    });

    it("User1 liquidity should = 0 && short fall should > 0", async () => {
        let result = await comptroller.getAccountLiquidity(user1.address);
        expect(result[1]).to.eq(0);
        expect(result[2]).to.gt(0);
    });
  
    it("Deploy Aave FlashLoan contract", async () => {
        let borrowBalance = await cTokenA.callStatic.borrowBalanceCurrent(
          user1.address
        );
  
        repayAmount = (BigInt(borrowBalance) * closeFactor) / BigInt(1e18);
  
        const flashloanFactory = await ethers.getContractFactory("AaveFlashLoan");
        Flashloan = await flashloanFactory
          .connect(user2)
          .deploy(
            aaveAddress,
            uniswapRouter,
            cTokenA.address,
            cTokenB.address,
            user1.address,
            repayAmount
          );
      });
  
      it("Execute ...", async () => {
        await Flashloan.connect(user2).flashLoan(usdcAddress, repayAmount);
        // User2 透過 AAVE 的 Flash loan 來清算，可以自行檢查清算 50% 後是不是大約可以賺 121 USD
        expect(await usdc.balanceOf(user2.address)).to.gt(0);
      });
});