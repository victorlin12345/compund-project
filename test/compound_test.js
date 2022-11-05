const { expect } = require('chai')
const { ethers } = require('hardhat')
const helpers = require("@nomicfoundation/hardhat-network-helpers");

describe("Compound", function(){
    let MyERC20, CMyErc20, Owner, Addr1

    before(async () => {

        [Owner, Addr1] = await ethers.getSigners();
        // Comptroller
        const ComptrollerFactory = await ethers.getContractFactory("Comptroller");
        const Comptroller = await ComptrollerFactory.deploy();
        await Comptroller.deployed();

        // SimplePriceOracle
        const SimplePriceOracleFactory = await ethers.getContractFactory("SimplePriceOracle");
        const SimplePriceOracle = await SimplePriceOracleFactory.deploy();
        await SimplePriceOracle.deployed();

        // setup SimplePriceOracle to Comptroller
        await Comptroller._setPriceOracle(SimplePriceOracle.address);

        // MyToken (underlying token)
        const MyERC20Factory = await ethers.getContractFactory("MyERC20");
        MyERC20 = await MyERC20Factory.deploy(ethers.utils.parseUnits("6000000", 18));
        await MyERC20.deployed();

        // Interest Rate
        const InterestRateFactory = await ethers.getContractFactory("WhitePaperInterestRateModel");
        const InterestRate = await InterestRateFactory.deploy(0, 0);
        await InterestRate.deployed();

        // CErc20Immutable: Immutable 多一個將 admin = payable(msg.sender)
        // InterestRate: WhitePaperInterestRateModel
        // initialExchangeRateMantissa_: 初始 exchangeRate 為 1:1
        // cMyERC20 的 decimals 皆為 18
        const CErc20Factory = await ethers.getContractFactory("CErc20Immutable");
        CMyErc20 = await CErc20Factory.deploy(
            MyERC20.address,
            Comptroller.address,
            InterestRate.address,
            ethers.utils.parseUnits("1", 18),
            "cMyERC20",
            "cME",
            18,
            Owner.address,
        );
        await CMyErc20.deployed();

        await Comptroller._supportMarket(CMyErc20.address);
    })

    describe("CERC20", async () => {
        it ("Mint 100 cMyERC20", async function(){ 
            let mintAmount = 100;
            // myERC20 100 轉給 cMyERC20 contract
            await MyERC20.approve(CMyErc20.address, mintAmount);
            // mint cERC20 100
            await CMyErc20.mint(100);
        
            expect(await CMyErc20.balanceOf(Owner.address)).to.equal(mintAmount);
        })

        it ("Redeem cMyERC20 100 back", async function() {
            let mintAmount = 100;
            await CMyErc20.redeem(mintAmount);
            
            expect(await CMyErc20.balanceOf(Owner.address)).to.equal(0);
        })
    })
});
