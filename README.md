# Compound-project

```shell
npx hardhat test test/compound_test.js
```

ref: https://github.com/AppWorks-School/Blockchain-Resource/blob/main/section3/lending.md

## 實作

請賞析 Compound 的合約，並依序實作以下

1. 在 Hardhat 的 test 中部署一個 CErc20(CErc20.sol)，一個 Comptroller(Comptroller.sol) 以及合約初始化時相關必要合約，請遵循以下細節：
- CToken 的 decimals 皆為 18
- 需部署一個 CErc20 的 underlying ERC20 token，decimals 為 18
- 使用 SimplePriceOracle 作為 Oracle
- 將利率模型合約中的借貸利率設定為 0%
- 初始 exchangeRate 為 1:1
2. 進階(Optional)： 使用 Compound 的 Proxy 合約（CErc20Delegator.sol and Unitroller.sol)
- 讓 user1 mint/redeem CErc20，請透過 Hardhat test case 實現以下場景
- User1 使用 100 顆（100 * 10^18） ERC20 去 mint 出 100 CErc20 token，再用 100 CErc20 token redeem 回 100 顆 ERC20
3. 讓 user1 borrow/repay
- 延續上題，部署另一份 CErc20 合約
- 在 Oracle 中設定一顆 token A 的價格為 $1，一顆 token B 的價格為 $100
- Token B 的 collateral factor 為 50%
- User1 使用 1 顆 token B 來 mint cToken
- User1 使用 token B 作為抵押品來借出 50 顆 token A
4. 延續 (3.) 的借貸場景，調整 token A 的 collateral factor，讓 user1 被 user2 清算
5. 延續 (3.) 的借貸場景，調整 oracle 中的 token B 的價格，讓 user1 被 user2 清算