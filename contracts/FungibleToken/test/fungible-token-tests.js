const chai = require('chai');
let chaiAsPromised = require("chai-as-promised");
chai.use(chaiAsPromised);
const assert = chai.assert;
const utils = require('./../../Utils/utils');
const AeSDK = require('@aeternity/aepp-sdk');
const Universal = AeSDK.Universal;
const config = require("./constants/config.json");
const contractFilePath = "./../contracts/fungible-token.aes";

const path = require('path');
const errorMessages = require('./constants/error-messages.json');

describe('Fungible token', () => {

	let firstClient;
	let secondClient;
	let contentOfContract;

	before(async () => {
		firstClient = await Universal({
			url: config.host,
			internalUrl: config.internalHost,
			keypair: config.ownerKeyPair,
			nativeMode: true,
			networkId: 'ae_devnet'
		});

		secondClient = await Universal({
			url: config.host,
			internalUrl: config.internalHost,
			keypair: config.notOwnerKeyPair,
			nativeMode: true,
			networkId: 'ae_devnet'
		});


		firstClient.setKeypair(config.ownerKeyPair)
		await firstClient.spend(1, config.notOwnerKeyPair.publicKey)
		contentOfContract = utils.readFileRelative(path.resolve(__dirname, contractFilePath), config.filesEncoding);
	})

	describe('Deploy contract', () => {

		it('deploying successfully', async () => {
			//Arrange
			const compiledContract = await firstClient.contractCompile(contentOfContract, {})

			//Act
			const deployPromise = compiledContract.deploy({
				options: {
					ttl: config.ttl
				},
				abi: "sophia"
			});

			//Assert
			const deployedContract = await deployPromise;
			assert.equal(config.ownerKeyPair.publicKey, deployedContract.owner)
		})

	})

	describe('Interact with contract', () => {
		let deployedContract;
		let compiledContract;

		beforeEach(async () => {
			compiledContract = await firstClient.contractCompile(contentOfContract, {})
			deployedContract = await compiledContract.deploy({
				options: {
					ttl: config.ttl
				},
				abi: "sophia"
			});
		})

		describe('Contract functionality', () => {
			beforeEach(async () => {
				const mintPromise = deployedContract.call('mint', {
					args: `(${config.pubKeyHex}, 1000)`,
					options: {
						ttl: config.ttl
					},
					abi: "sophia"
				})
				
				await mintPromise;
			})

			describe('Mint', () => {
				it('should mint 1000 token successfully', async () => {
					//Arrange
					const expectedBalance = 1000;

					//Act
					const balanceOfPromise = deployedContract.call('balanceOf', {
						args: `(${config.pubKeyHex})`,
						options: {
							ttl: config.ttl
						}
					});
					
					const balanceOfResult = await balanceOfPromise;

					//Assert
					const decodedBalanceOfResult = await balanceOfResult.decode("int");
					assert.equal(decodedBalanceOfResult.value, expectedBalance)
				})

				it('should not mint from non-owner', async () => {
					const unauthorisedPromise = secondClient.contractCall(compiledContract.bytecode, 'sophia', deployedContract.address, "mint", {
						args: `(${config.pubKeyHex}, 123)`,
						options: {
							ttl: config.ttl
						}
					})
					await assert.isRejected(unauthorisedPromise, errorMessages.ONLY_OWNER_CAN_MINT);
				})

				it('should increase total supply on mint', async () => {
					//Arrange
					const expectedTotalSupply = 1003;

					//Act
					//1000 tokens are already minted
					const deployContractPromise1 = deployedContract.call('mint', {
						args: `(${config.pubKeyHex}, 1)`,
						options: {
							ttl: config.ttl
						},
						abi: "sophia"
					})
					
					await deployContractPromise1;

					const deployContractPromise2 = deployedContract.call('mint', {
						args: `(${config.pubKeyHex}, 1)`,
						options: {
							ttl: config.ttl
						},
						abi: "sophia"
					})
					
					await deployContractPromise2;

					const deployContractPromise3 = deployedContract.call('mint', {
						args: `(${config.pubKeyHex}, 1)`,
						options: {
							ttl: config.ttl
						},
						abi: "sophia"
					})
					await deployContractPromise3;

					const totalSupplyPromise = deployedContract.call('totalSupply', {
						options: {
							ttl: config.ttl
						}
					});

					const totalSupplyResult = await totalSupplyPromise;

					//Assert
					const totalSupplyResultDecoded = await totalSupplyResult.decode("int");
					assert.equal(totalSupplyResultDecoded.value, expectedTotalSupply)
				})

			})

			describe('Burn', () => {
				it('should burn token successfully', async () => {
					//Arrange
					const expectedBalance = 900;
					const burnAmount = 100;

					//Act
					const ownerOfPromise = deployedContract.call('burn', {
						args: `(${burnAmount})`,
						options: {
							ttl: config.ttl
						}
					});
					
					await ownerOfPromise;

					const balanceOfPromise = deployedContract.call('balanceOf', {
						args: `(${config.pubKeyHex})`,
						options: {
							ttl: config.ttl
						}
					});
					
					const balanceOfResult = await balanceOfPromise;

					//Assert
					const decodedBalanceOfResult = await balanceOfResult.decode("int");
					assert.equal(decodedBalanceOfResult.value, expectedBalance)
				})

				it('shouldn`t burn more tokens than it has', async () => {
					//Arrange
					const burnAmount = 100;

					//Act
					const unauthorizedBurnPromise = secondClient.contractCall(compiledContract.bytecode, 'sophia', deployedContract.address, "burn", {
						args: `(${burnAmount})`,
						options: {
							ttl: config.ttl
						}
					})

					//Assert
					await assert.isRejected(unauthorizedBurnPromise, errorMessages.LESS_TOKENS_THAN_ACCOUNT_BALANCE);
				})

				it('should decrease total supply on burn', async () => {
					//Arrange
					const expectedTotalSupply = 900;
					const burnAmount = 50;

					//Act
					const ownerOfPromise1 = deployedContract.call('burn', {
						args: `(${burnAmount})`,
						options: {
							ttl: config.ttl
						}
					});
					
					await ownerOfPromise1;

					const ownerOfPromise2 = deployedContract.call('burn', {
						args: `(${burnAmount})`,
						options: {
							ttl: config.ttl
						}
					});
					
					await ownerOfPromise2;

					const balanceOfPromise = deployedContract.call('totalSupply', {
						options: {
							ttl: config.ttl
						}
					});
					
					const balanceOfResult = await balanceOfPromise;

					//Assert
					const decodedBalanceOfResult = await balanceOfResult.decode("int");
					assert.equal(decodedBalanceOfResult.value, expectedTotalSupply)
				})
			})

			describe.only('Transfer', async () => {

				it('should transfer token successfully', async () => {
					//Arrange
					const expectedBalanceOfNotOwner = 10;
					const expectedBalanceOfOwner = 990;
					const transferAmount = 10;

					//Act
					const approvePromise = deployedContract.call('approve', {
						args: `(${utils.publicKeyToHex(config.notOwnerKeyPair.publicKey)}, ${transferAmount})`,
						options: {
							ttl: config.ttl
						}
					});
					
					await approvePromise;

					const transferFromPromise = secondClient.contractCall(compiledContract.bytecode, 'sophia', deployedContract.address, "transferFrom", {
						args: `(${config.pubKeyHex}, ${config.notOwnerPubKeyHex}, ${transferAmount})`,
						options: {
							ttl: config.ttl
						}
					})

					await transferFromPromise;
					
					const balanceOfNotOwnerPromise = deployedContract.call('balanceOf', {
						args: `(${config.notOwnerPubKeyHex})`,
						options: {
							ttl: config.ttl
						}
					});
					
					const balanceOfNotOwnerResult = await balanceOfNotOwnerPromise;
					
					const balanceOwnerPromise = deployedContract.call('balanceOf', {
						args: `(${config.pubKeyHex})`,
						options: {
							ttl: config.ttl
						}
					});
					
					const balanceOfOwnerResult = await balanceOwnerPromise;

					//Assert
					const decodedBalanceOfNotOwnerResult = await balanceOfNotOwnerResult.decode("int");
					const decodedBalanceOfOwnerResult = await balanceOfOwnerResult.decode("int");

					assert.equal(decodedBalanceOfNotOwnerResult.value, expectedBalanceOfNotOwner)
					assert.equal(decodedBalanceOfOwnerResult.value, expectedBalanceOfOwner)
				})

				it('shouldn`t transfer token without approve', async () => {
					//Arrange
					const expectedBalanceOfNotOwner = 0;
					const expectedBalanceOfOwner = 1000;
					const transferAmount = 123;

					//Act
					const transferFromPromise = secondClient.contractCall(compiledContract.bytecode, 'sophia', deployedContract.address, "transferFrom", {
						args: `(${config.pubKeyHex}, ${config.notOwnerPubKeyHex}, ${transferAmount})`,
						options: {
							ttl: config.ttl
						}
					})

					await assert.isRejected(transferFromPromise, 'Invocation failed');

					const balanceOfNotOwnerPromise = deployedContract.call('balanceOf', {
						args: `(${config.notOwnerPubKeyHex})`,
						options: {
							ttl: config.ttl
						}
					});
					
					const balanceOfNotOwnerResult = await balanceOfNotOwnerPromise;

					const balanceOwnerPromise = deployedContract.call('balanceOf', {
						args: `(${config.pubKeyHex})`,
						options: {
							ttl: config.ttl
						}
					});
					
					const balanceOfOwnerResult = await balanceOwnerPromise;

					//Assert
					const decodedBalanceOfNotOwnerResult = await balanceOfNotOwnerResult.decode("int");
					const decodedBalanceOfOwnerResult = await balanceOfOwnerResult.decode("int");

					assert.equal(decodedBalanceOfNotOwnerResult.value, expectedBalanceOfNotOwner)
					assert.equal(decodedBalanceOfOwnerResult.value, expectedBalanceOfOwner)
				})
			})

			describe('Transfer', () => {
				it('should increase allowance successfully', async () => {
					//Arrange
					const expectedAllowance = 20;
					const transferAmount = 10;

					//Act
					const approvePromise = deployedContract.call('approve', {
						args: `(${config.notOwnerPubKeyHex}, ${transferAmount})`,
						options: {
							ttl: config.ttl
						}
					});
					
					await approvePromise;

					const increaseAllowancePromise = deployedContract.call('increaseAllowance', {
						args: `(${config.notOwnerPubKeyHex}, ${transferAmount})`,
						options: {
							ttl: config.ttl
						}
					});
					
					await increaseAllowancePromise;

					const allowancePromise = deployedContract.call('allowance', {
						args: `(${config.pubKeyHex}, ${config.notOwnerPubKeyHex})`,
						options: {
							ttl: config.ttl
						}
					});
					
					const allowancePromiseResult = await allowancePromise;

					//Assert
					const allowanceResult = await allowancePromiseResult.decode("int");

					assert.equal(allowanceResult.value, expectedAllowance)
				})

				it('should deccrease allowance successfully', async () => {
					//Arrange
					const expectedAllowance = 9;
					const transferAmount = 10;
					const decreaseAmount = 1;

					//Act
					const approvePromise = deployedContract.call('approve', {
						args: `(${config.notOwnerPubKeyHex}, ${transferAmount})`,
						options: {
							ttl: config.ttl
						}
					});
					
					await approvePromise;

					const decreaseAllowancePromise = deployedContract.call('decreaseAllowance', {
						args: `(${config.notOwnerPubKeyHex}, ${decreaseAmount})`,
						options: {
							ttl: config.ttl
						}
					});
					
					await decreaseAllowancePromise;

					const allowancePromise = deployedContract.call('allowance', {
						args: `(${config.pubKeyHex}, ${config.notOwnerPubKeyHex})`,
						options: {
							ttl: config.ttl
						}
					});
					
					const allowancePromiseResult = await allowancePromise;

					//Assert
					const allowanceResult = await allowancePromiseResult.decode("int");

					assert.equal(allowanceResult.value, expectedAllowance)
				})
			})
		})
	})
})