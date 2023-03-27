// Created by rhvall
//
// GNU GENERAL PUBLIC LICENSE
// Version 3, 29 June 2007
// Copyright (C) 2007 Free Software Foundation, Inc. <https://fsf.org/>
// Everyone is permitted to copy and distribute verbatim copies
// of this license document, but changing it is not allowed.

import {
  method,
  AccountUpdate,
  PublicKey,
  PrivateKey,
  DeployArgs,
  SmartContract,
  Permissions,
  State,
  state,
  MerkleTree,
  MerkleWitness,
  Field,
  Struct,
  Experimental
} from 'snarkyjs';

export const treeHeight = 20;
export class MKWitness extends MerkleWitness(treeHeight) { }
const baseAmount = 1_000_000_000;

export class BaseStruct extends Struct ({
      preRoot: Field,
      posRoot: Field
  })
{
  static createStruct(mWitness: MKWitness): BaseStruct {
      return new BaseStruct({
          preRoot: mWitness.calculateRoot(Field(0)),
          posRoot: mWitness.calculateRoot(Field(1))
      });
  }

  static verifyProof(
      proof: BaseStruct,
      mkWitness: MKWitness
  ): Boolean {
      mkWitness.calculateRoot(Field(0)).assertEquals(proof.preRoot);
      mkWitness.calculateRoot(Field(1)).assertEquals(proof.posRoot);

      return true;
  }

  static assertEquals(left: BaseStruct, right: BaseStruct) {
      left.preRoot.assertEquals(right.preRoot);
      left.posRoot.assertEquals(right.posRoot);
  }
}

export const BaseProgram = Experimental.ZkProgram({
  publicInput: BaseStruct,

  methods: {
      createDepositProof: {
          privateInputs: [MKWitness],

          method(state: BaseStruct, treeWitness: MKWitness) {
              const created = BaseStruct.createStruct(treeWitness);
              BaseStruct.assertEquals(state, created);
          },
      }
  },
});

export let BaseProgram_ = Experimental.ZkProgram.Proof(BaseProgram);
export class BaseProof extends BaseProgram_ {}

export class BaseContract extends SmartContract {
  // Public key of the contract administrator
  @state(PublicKey) adminPublicKey = State<PublicKey>();
  // mRoot is the root hash of the Merkle tree
  @state(Field) mRoot = State<Field>();

  deploy(args: DeployArgs) {
      super.deploy(args);
      let proofToEdit = Permissions.proof();
      // let signToEdit = Permissions.signature();
      this.account.permissions.set({
          ...Permissions.default(),
          editState: Permissions.proofOrSignature(),
          editSequenceState: proofToEdit,
          // setTokenSymbol: signToEdit,
          send: proofToEdit
      });
  }

  @method override init(adminKey: PrivateKey) {
      super.init();
      this.adminPublicKey.set(adminKey.toPublicKey());
      this.requireSignature();

      const tree = new MerkleTree(treeHeight);
      this.mRoot.set(tree.getRoot());
  }

  @method depositBase(senderAddr: PublicKey, treeWitness: MKWitness, depositProof: BaseProof) {
      // Acquire the contract's mRoot
      const mRoot = this.mRoot.get();
      this.mRoot.assertEquals(mRoot);

      depositProof.verify();

      // Verify that the stored root equals the proof preRoot
      mRoot.assertEquals(depositProof.publicInput.preRoot);
      
      // Confirm that the witness matches what is stored in the zkApp
      treeWitness.calculateRoot(Field(0)).assertEquals(mRoot);
      
      // Send the funds to the contract
      // let senderUpdate = AccountUpdate.createSigned(senderKey);
      let senderUpdate = AccountUpdate.create(senderAddr);
      senderUpdate.send({ to: this.address, amount: baseAmount });
      senderUpdate.requireSignature();

      // Update the unTree values stored in the contract
      this.mRoot.set(depositProof.publicInput.posRoot);
  }
}