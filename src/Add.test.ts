// Created by rhvall
//
// GNU GENERAL PUBLIC LICENSE
// Version 3, 29 June 2007
// Copyright (C) 2007 Free Software Foundation, Inc. <https://fsf.org/>
// Everyone is permitted to copy and distribute verbatim copies
// of this license document, but changing it is not allowed.

import { MKWitness, BaseContract, treeHeight, BaseProgram, BaseStruct } from './Add';
import {
  isReady,
  shutdown,
  Field,
  Mina,
  PrivateKey,
  PublicKey,
  AccountUpdate,
  UInt64,
  MerkleTree,
  Poseidon,
  MerkleMap
} from 'snarkyjs';

let proofsEnabled = true;

describe('BaseContract', () => {
  let deployerKey: PrivateKey,
      deployerAddr: PublicKey,
      local0Key: PrivateKey,
      local0Addr: PublicKey,
      local1Key: PrivateKey,
      local1Addr: PublicKey,
      zkAppKey: PrivateKey,
      zkAppAddr: PublicKey,
      zkApp: BaseContract;

  beforeAll(async () => {
    await isReady;
    if (proofsEnabled) 
    {
      await BaseProgram.compile();
      await BaseContract.compile();
    }
  });

  beforeEach(() => {
    const Local = Mina.LocalBlockchain({ proofsEnabled });
    Mina.setActiveInstance(Local);
    deployerKey = Local.testAccounts[0].privateKey;
    deployerAddr = deployerKey.toPublicKey();
    local0Key = PrivateKey.random();
    local0Addr = local0Key.toPublicKey();
    local1Key = PrivateKey.random();
    local1Addr = local1Key.toPublicKey();
    zkAppKey = PrivateKey.random();
    zkAppAddr = zkAppKey.toPublicKey();
    zkApp = new BaseContract(zkAppAddr);
  });

  afterAll(() => {
    setTimeout(shutdown, 0);
  });

  async function localDeploy() 
  {
    const txn = await Mina.transaction(deployerAddr, () => 
    {
      AccountUpdate.fundNewAccount(deployerAddr);
      zkApp.deploy({ zkappKey: zkAppKey });
      zkApp.init(deployerKey);
      // zkApp.requireSignature();
    });
    
    // await txn.prove();
    // await txn.send();
    // this tx needs .sign(), because `deploy()` adds an account update that requires signature authorization
    await txn.sign([deployerKey, zkAppKey]).send();

    // // Provide a mina to the local0Addr account
    const txn2 = await Mina.transaction(deployerAddr, () => {
      AccountUpdate.fundNewAccount(deployerAddr, 2);
      let feePayerUpdate = AccountUpdate.createSigned(deployerAddr);
      feePayerUpdate.send({ to: local0Addr, amount: UInt64.from(3e9) });
      feePayerUpdate.send({ to: local1Addr, amount: UInt64.from(1) }); // Pay the mina balance
    });
    // await txn2.prove();
    await txn2.sign([deployerKey]).send();

    // Check that the admin address is equal to the one set at "init"
    // let adminAddr = await zkApp.adminPublicKey.fetch();
    // adminAddr?.assertEquals(deployerKey.toPublicKey());

    // If needed to show the Pub/Priv keys
    // console.log(`ZKApp: ${zkAppAddr.toBase58()} \n ${zkAppKey.toBase58()}`);
    // console.log(`Local0: ${local0Addr.toBase58()} \n ${local1Key.toBase58()}`);
  }

  it('Deposit MINA to BaseContract', async () => 
  {
    await localDeploy();

    var mTree = new MerkleTree(treeHeight);
    const baseTreeRoot = mTree.getRoot()
    
    var witness = mTree.getWitness(0n);
    var witnessTree = new MKWitness(witness);
    
    zkApp.mRoot.assertEquals(baseTreeRoot);

    // const { verificationKey } = await BaseProgram.compile();
    await BaseProgram.compile();
    const preState = BaseStruct.createStruct(witnessTree);
    const preProof = await BaseProgram.createDepositProof(preState, witnessTree);

    // Make sure balances are as expected before transaction
    Mina.getBalance(zkAppAddr).assertEquals(UInt64.from(0));
    Mina.getBalance(local0Addr).assertEquals(UInt64.from(3e9));
    Mina.getBalance(local1Addr).assertEquals(UInt64.from(1));

    console.log("Pre transaction");
    // Deposit 1 mina from local0 to the contract
    const txDep = await Mina.transaction(local0Addr, () => 
    {
        // AccountUpdate.fundNewAccount(local1Key);
        // zkApp.deposit(UInt64.from(1e9), local0Key);
        zkApp.depositBase(local0Addr, witnessTree, preProof);
    });
    
    console.log("Pre prove");
    await txDep.prove();
    console.log("Pos prove");
    await txDep.sign([local0Key]).send();
    // await txDep.send();

    Mina.getBalance(zkAppAddr).assertEquals(UInt64.from(1e9));
    Mina.getBalance(local0Addr).assertEquals(UInt64.from(2e9));
    Mina.getBalance(local1Addr).assertEquals(UInt64.from(1));
  });
});
