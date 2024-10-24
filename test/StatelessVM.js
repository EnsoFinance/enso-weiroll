const { expect } = require("chai");
const { ethers } = require("hardhat");
const weiroll = require("@ensofinance/weiroll.js");

const deploy = async (name) => (await ethers.getContractFactory(name)).deploy();

const deployContract = async (name) =>
  weiroll.Contract.createContract(await deploy(name));

const deployLibrary = async (name) => 
  weiroll.Contract.createLibrary(await deploy(name));

describe("StatelessVM", function () {
  const testString = "Hello, world!";

  let events,
    vm,
    math,
    strings,
    arrays,
    sender,
    revert,
    token,
    payable,
    params;
  let supply = ethers.BigNumber.from("100000000000000000000");
  let eventsContract, structContract;

  before(async () => {
    math = await deployLibrary("Math");
    strings = await deployLibrary("Strings");
    arrays = await deployLibrary("Arrays");
    sender = await deployLibrary("Sender");
    revert = await deployLibrary("Revert");
    payable = await deployContract("Payable");
    params = await deployContract("Params");

    eventsContract = await (await ethers.getContractFactory("Events")).deploy();
    events = weiroll.Contract.createLibrary(eventsContract);

    structContract = await (await ethers.getContractFactory("Struct")).deploy();
    struct = weiroll.Contract.createLibrary(structContract);

    const VM = await ethers.getContractFactory("TestableStatelessVM");
    vm = await VM.deploy();

    token = await (
      await ethers.getContractFactory("ExecutorToken")
    ).deploy(supply);
  });

  function execute(commands, state, overrides) {
    let encodedCommands = commands.map(([target, func, inargs, outargs]) =>
      ethers.utils.concat([
        func ? target.interface.getSighash(func) : "0x12345678",
        inargs,
        outargs,
        target.address,
      ])
    );
    return vm.execute(encodedCommands, state, { ...overrides });
  }

  it("Should return msg.sender", async () => {
    const [caller] = await ethers.getSigners();
    const planner = new weiroll.Planner();
    const msgSender = planner.add(sender.sender());
    planner.add(events.logAddress(msgSender));

    const { commands, state } = planner.plan();

    const tx = await vm.execute(commands, state);
    await expect(tx)
      .to.emit(eventsContract.attach(vm.address), "LogAddress")
      .withArgs(caller.address);

    const receipt = await tx.wait();
    console.log(`Msg.sender: ${receipt.gasUsed.toNumber()} gas`);
  });

  it("Should execute a simple addition program", async () => {
    const planner = new weiroll.Planner();
    let a = 1,
      b = 1;
    for (let i = 0; i < 8; i++) {
      const ret = planner.add(math.add(a, b));
      a = b;
      b = ret;
    }
    planner.add(events.logUint(b));
    const { commands, state } = planner.plan();

    const tx = await vm.execute(commands, state);
    await expect(tx)
      .to.emit(eventsContract.attach(vm.address), "LogUint")
      .withArgs(55);

    const receipt = await tx.wait();
    console.log(`Array sum: ${receipt.gasUsed.toNumber()} gas`);
  });

  it("Should execute a string length program", async () => {
    const planner = new weiroll.Planner();
    const len = planner.add(strings.strlen(testString));
    planner.add(events.logUint(len));
    const { commands, state } = planner.plan();

    const tx = await vm.execute(commands, state);
    await expect(tx)
      .to.emit(eventsContract.attach(vm.address), "LogUint")
      .withArgs(13);

    const receipt = await tx.wait();
    console.log(`String concatenation: ${receipt.gasUsed.toNumber()} gas`);
  });

  it("Should concatenate two strings", async () => {
    const planner = new weiroll.Planner();
    const result = planner.add(strings.strcat(testString, testString));
    planner.add(events.logString(result));
    const { commands, state } = planner.plan();

    const tx = await vm.execute(commands, state);
    await expect(tx)
      .to.emit(eventsContract.attach(vm.address), "LogString")
      .withArgs(testString + testString);

    const receipt = await tx.wait();
    console.log(`String concatenation: ${receipt.gasUsed.toNumber()} gas`);
  });

  it("Should sum an array of uints", async () => {
    const planner = new weiroll.Planner();
    const result = planner.add(math.sum([1, 2, 3]));
    planner.add(events.logUint(result));
    const { commands, state } = planner.plan();

    const tx = await vm.execute(commands, state);
    await expect(tx)
      .to.emit(eventsContract.attach(vm.address), "LogUint")
      .withArgs(6);

    const receipt = await tx.wait();
    console.log(`Math sum: ${receipt.gasUsed.toNumber()} gas`);
  });

  it("Should execute payable function", async () => {
    const amount = ethers.constants.WeiPerEther.mul(123);
    const planner = new weiroll.Planner();

    planner.add(payable.pay().withValue(amount));
    const balance = planner.add(payable.balance());
    planner.add(
      events.logUintPayable(balance)
    );
    const { commands, state } = planner.plan();

    const tx = await vm.execute(commands, state, { value: amount });
    await expect(tx).to.emit(eventsContract.attach(vm.address), "LogUint").withArgs(amount);
    expect(await ethers.provider.getBalance(payable.address)).to.be.equal(
      amount
    );

    const receipt = await tx.wait();
    console.log(`Payable: ${receipt.gasUsed.toNumber()} gas`);
  });

  it("Should pass return value to dynamic tuple", async () => {
    const planner = new weiroll.Planner();
    const result = planner.add(math.add(1, 2));
    planner.add(struct.returnDynamicParamAndStruct("Test", { a: result, b: token.address}));
    const {commands, state} = planner.plan();

    const tx = await vm.execute(commands, state);
    await expect(tx)
      .to.emit(structContract.attach(vm.address), "LogString")
      .withArgs("Test");
    await expect(tx)
      .to.emit(structContract.attach(vm.address), "LogUint")
      .withArgs(3);
    await expect(tx)
      .to.emit(structContract.attach(vm.address), "LogAddress")
      .withArgs(token.address);

    const receipt = await tx.wait();
    console.log(`dynamic param and struct: ${receipt.gasUsed.toNumber()} gas`);
  });

  it("Should pass return value to array of tuples", async () => {
    const planner = new weiroll.Planner();
    const result = planner.add(math.add(1, 2));
    planner.add(struct.returnMultiStructArray([
      {
        a: "0x1010101010101010101010101010101010101010",
        b: "0x1111111111111111111111111111111111111111",
        d: {
          id: "0xdadadadadadadadadadadadadadadadadadadadadadadadadadadadadadadada",
          category: 1,
          from: "0x1212121212121212121212121212121212121212",
          to: "0x1313131313131313131313131313131313131313",
          amount: result,
          data: "0xbebebebe"
        }
      },{
        a: "0x2020202020202020202020202020202020202020",
        b: "0x2121212121212121212121212121212121212121",
        d: {
          id: "0xfafafafafafafafafafafafafafafafafafafafafafafafafafafafafafafafa",
          category: 2,
          from: "0x2222222222222222222222222222222222222222",
          to: "0x2323232323232323232323232323232323232323",
          amount: result,
          data: "0xbebebebe"
        }
      }
    ]));
    const {commands, state} = planner.plan();

    const tx = await vm.execute(commands, state);
    await expect(tx)
      .to.emit(structContract.attach(vm.address), "LogUint")
      .withArgs(3);

    const receipt = await tx.wait();
    console.log(`dynamic param and struct: ${receipt.gasUsed.toNumber()} gas`);
  });

  it("Should pass return value to array struct", async () => {
    const planner = new weiroll.Planner();
    const result = planner.add(math.add(1, 2));
    planner.add(struct.returnArrayStructSum(
      {
        a: "0x1010101010101010101010101010101010101010",
        values: [ result, 2, 5 ]
      }
    ));
    const {commands, state} = planner.plan();

    const tx = await vm.execute(commands, state);
    await expect(tx)
      .to.emit(structContract.attach(vm.address), "LogUint")
      .withArgs(10);

    const receipt = await tx.wait();
    console.log(`sum array struct: ${receipt.gasUsed.toNumber()} gas`);
  });

  it("Should pass return value to complex struct", async () => {
    const planner = new weiroll.Planner();
    const result = planner.add(math.add(1, 2));
    planner.add(struct.returnComplexStruct(
      {
        id: "0xdadadadadadadadadadadadadadadadadadadadadadadadadadadadadadadada",
        category: 1,
        from: "0x1212121212121212121212121212121212121212",
        to: "0x1313131313131313131313131313131313131313",
        amount: result,
        data: "0x"
      },
      {
        from: "0x1414141414141414141414141414141414141414",
        approvedFrom: false,
        to: "0x1515151515151515151515151515151515151515",
        approvedTo: false
      },
      1,
      ethers.constants.MaxUint256
    ));
    
    const {commands, state} = planner.plan();
    
    const tx = await vm.execute(commands, state);
    await expect(tx)
      .to.emit(structContract.attach(vm.address), "LogUint")
      .withArgs(3);

    const receipt = await tx.wait();
    console.log(`complex struct: ${receipt.gasUsed.toNumber()} gas`);
  })

  it("Should pass return value to multiarray struct", async () => {
    const planner = new weiroll.Planner();
    const result = planner.add(math.add(1, 2));
    planner.add(struct.returnMultiArrayStructSum(
      {
        a: "0x1010101010101010101010101010101010101010",
        values: [
          [ result, 2, 5 ],
          [ result, 1, 2, 4 ]
        ]
      }
    ));
    const {commands, state} = planner.plan();

    const tx = await vm.execute(commands, state);
    await expect(tx)
      .to.emit(structContract.attach(vm.address), "LogUint")
      .withArgs(20);

    const receipt = await tx.wait();
    console.log(`sum array struct: ${receipt.gasUsed.toNumber()} gas`);
  });

  it("Should pass return value to array of arrays", async () => {
    const planner = new weiroll.Planner();
    const result = planner.add(math.add(1, 2));
    const total = planner.add(arrays.sumArrays([
      [ result, 2, 5 ],
      [ 7, result ],
      [ 1, 2, 2, result, 2 ]
    ]));
    planner.add(events.logUint(total));
    const {commands, state} = planner.plan();

    const tx = await vm.execute(commands, state);
    await expect(tx)
      .to.emit(eventsContract.attach(vm.address), "LogUint")
      .withArgs(30);

    const receipt = await tx.wait();
    console.log(`sum array of arrays: ${receipt.gasUsed.toNumber()} gas`);
  });

  it("Should pass return value to array of array struct", async () => {
    const planner = new weiroll.Planner();
    const result = planner.add(math.add(1, 2));
    planner.add(struct.returnArrayOfArrayStructSum([
      {
        a: "0x1010101010101010101010101010101010101010",
        values: [ result, 2, 5 ]
      },
      {
        a: "0x1010101010101010101010101010101010101010",
        values: [ result, 7 ]
      }
    ]));
    const {commands, state} = planner.plan();

    const tx = await vm.execute(commands, state);
    await expect(tx)
      .to.emit(structContract.attach(vm.address), "LogUint")
      .withArgs(20);

    const receipt = await tx.wait();
    console.log(`sum array of array structs: ${receipt.gasUsed.toNumber()} gas`);
  });

  it("Should pass return value to nested structs", async () => {
    const planner = new weiroll.Planner();
    const result = planner.add(strings.strcat("Hello ", "world!"));
    planner.add(struct.returnNestedStructString(
      {
        a: 3,
        b: {
          a: 2,
          b: {
            a: 1,
            b: {
              a: 0,
              b: {
                a: result,
                b: "Test"
              }
            }
          }
        }
      }
    ));
    const {commands, state} = planner.plan();

    const tx = await vm.execute(commands, state);
    await expect(tx)
      .to.emit(structContract.attach(vm.address), "LogString")
      .withArgs("Hello world!");

    const receipt = await tx.wait();
    console.log(`nested structs: ${receipt.gasUsed.toNumber()} gas`);
  });

  it("Should pass return value to big struct", async () => {
    const planner = new weiroll.Planner();
    const result = planner.add(math.add(1, 2));
    planner.add(struct.returnBigStruct(
      {
        a: result,
        b: result,
        c: result,
        d: result,
        e: result,
        f: result,
        g: result,
        h: result,
        i: result,
        j: result,
        k: result,
        l: result,
        m: result,
        n: result,
        o: result,
        p: result,
        q: result,
        r: result,
        s: result,
        t: result,
        u: result,
        v: result,
        w: result,
        x: result,
        y: result,
        z: result,
        aa: 42,
        bb: result,
        cc: result,
        dd: result,
        ee: result,
        ff: result,
      }
    ));
    const {commands, state} = planner.plan();

    const tx = await vm.execute(commands, state);
    await expect(tx)
      .to.emit(structContract.attach(vm.address), "LogUint")
      .withArgs(42);

    const receipt = await tx.wait();
    console.log(`big struct: ${receipt.gasUsed.toNumber()} gas`);
  });

  it("Should pass return value to array of dynamic strings", async () => {
    const planner = new weiroll.Planner();
    const result = planner.add(strings.strcat("Hello ", "world!"));
    const phrase = planner.add(arrays.concatArray(
      [result, " How ", "are ", "you?"]
    ));
    planner.add(events.logString(phrase));
    const {commands, state} = planner.plan();

    const tx = await vm.execute(commands, state);
    await expect(tx)
      .to.emit(eventsContract.attach(vm.address), "LogString")
      .withArgs("Hello world! How are you?");

    const receipt = await tx.wait();
    console.log(`nested structs: ${receipt.gasUsed.toNumber()} gas`);
  });

  it("Should propagate revert reasons", async () => {
    const planner = new weiroll.Planner();

    planner.add(revert.fail());
    const { commands, state } = planner.plan();

    await expect(vm.execute(commands, state)).to.be.revertedWith(
      `ExecutionFailed(0, "${revert.address}", "Hello World!")`
    );
  });

  it("Should propagate revert reasons with exactly 32 bytes", async () => {
    const planner = new weiroll.Planner();

    planner.add(revert.fail32ByteMessage());
    const { commands, state } = planner.plan();

    await expect(vm.execute(commands, state)).to.be.revertedWith(
      `ExecutionFailed(0, "${revert.address}", "Hello World!!!!!!!!!!!!!!!!!!!!!")`
    );
  });

  it("Should revert on failing assert", async () => {
    const planner = new weiroll.Planner();

    planner.add(revert.assertFail());
    const { commands, state } = planner.plan();

    await expect(vm.execute(commands, state)).to.be.revertedWith(
      `ExecutionFailed(0, "${revert.address}", "Unknown")`
    );
  })

  it("Should revert with Error(uint256) as unknown", async () => {
    const planner = new weiroll.Planner();

    planner.add(revert.uintError1());
    const { commands, state } = planner.plan();

    await expect(vm.execute(commands, state)).to.be.revertedWith(
      `ExecutionFailed(0, "${revert.address}", "Unknown")`
    );
  })

  it("Should revert with Error(uint256,uint256) as unknown", async () => {
    const planner = new weiroll.Planner();

    planner.add(revert.uintError2());
    const { commands, state } = planner.plan();

    await expect(vm.execute(commands, state)).to.be.revertedWith(
      `ExecutionFailed(0, "${revert.address}", "Unknown")`
    );
  })

  it("Should revert with Error(uint256,uint256,uint256) as unknown", async () => {
    const planner = new weiroll.Planner();

    planner.add(revert.uintError3());
    const { commands, state } = planner.plan();

    await expect(vm.execute(commands, state)).to.be.revertedWith(
      `ExecutionFailed(0, "${revert.address}", "Unknown")`
    );
  })

  it("Should revert with poorly encoded Error(uint256,uint256,uint256) as unknown", async () => {
    const planner = new weiroll.Planner();

    planner.add(revert.poorlyEncodedFakeErrorMessage());
    const { commands, state } = planner.plan();

    await expect(vm.execute(commands, state)).to.be.revertedWith(
      `ExecutionFailed(0, "${revert.address}", "Unknown")`
    );
  })

  it("Should revert with Error(uint256,uint256,uint256) with error message", async () => {
    const planner = new weiroll.Planner();

    planner.add(revert.fakeErrorMessage());
    const { commands, state } = planner.plan();

    // The values passed to the Error function inside `fakeErrorMessage()`
    // are chosen to duplicate the emitting of a string. Despite being
    // 3 uint parameters, an error message is still emitted. In the wild,
    // it should be unlikely for such an error to produce an error message
    await expect(vm.execute(commands, state)).to.be.revertedWith(
      `ExecutionFailed(0, "${revert.address}", "Hello World!")`
    );
  })

  it("Should accept 32 inputs", async () => {
    const planner = new weiroll.Planner();
    const result = planner.add(params.param32(
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32
    ));
    planner.add(events.logUint(result));
    const { commands, state } = planner.plan();

    const tx = await vm.execute(commands, state);
    await expect(tx)
      .to.emit(eventsContract.attach(vm.address), "LogUint")
      .withArgs(528);
  });

  it("Should accept 31 inputs + value: tx with value + payable event", async () => {
    const amount = ethers.constants.WeiPerEther.mul(123);
    const planner = new weiroll.Planner();
    const result = planner.add(params.param31(
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31
    ).withValue(amount));
    planner.add(events.logUintPayable(result));
    const { commands, state } = planner.plan();

    const tx = await vm.execute(commands, state, { value: amount });
    await expect(tx)
      .to.emit(eventsContract.attach(vm.address), "LogUint")
      .withArgs(496);
  });

  it("Should accept 31 inputs + value: tx without value + nonpayable event", async () => {
    const amount = ethers.constants.WeiPerEther.mul(123);
    const [caller] = await ethers.getSigners();
    await caller.sendTransaction({ to: vm.address, value: amount });

    const planner = new weiroll.Planner();
    const result = planner.add(params.param31(
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31
    ).withValue(amount));
    planner.add(events.logUint(result));
    const { commands, state } = planner.plan();

    const tx = await vm.execute(commands, state);
    await expect(tx)
      .to.emit(eventsContract.attach(vm.address), "LogUint")
      .withArgs(496);
  });

  it("Should fail to accept 31 inputs + value: tx with value + nonpayable event", async () => {
    const amount = ethers.constants.WeiPerEther.mul(123);
    const planner = new weiroll.Planner();
    const result = planner.add(params.param31(
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31
    ).withValue(amount));
    planner.add(events.logUint(result));
    const { commands, state } = planner.plan();

    await expect(vm.execute(commands, state, { value: amount }))
      .to.be.revertedWith('ExecutionFailed(2, "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853", "Unknown")');
  });
});