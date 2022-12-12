const { expect } = require("chai");
const { ethers } = require("hardhat");
const weiroll = require("@ensofinance/weiroll.js");

const deploy = async (name) => (await ethers.getContractFactory(name)).deploy();

const deployLibrary = async (name) =>
  weiroll.Contract.createLibrary(await deploy(name));

const deployContract = async (name) =>
  weiroll.Contract.createContract(await deploy(name));

describe("VM", function () {
  const testString = "Hello, world!";
  const hexTestString = ethers.utils.hexlify(
    ethers.utils.toUtf8Bytes(testString)
  );
  const testEtherAmount = ethers.constants.WeiPerEther.div(2);

  let events,
    vm,
    math,
    strings,
    struct,
    arrays,
    stateTest,
    sender,
    revert,
    fallback,
    token,
    payable;
  let supply = ethers.BigNumber.from("100000000000000000000");
  let eventsContract, fallbackContract;

  before(async () => {
    math = await deployLibrary("Math");
    strings = await deployLibrary("Strings");
    struct = await deployLibrary("Struct");
    arrays = await deployLibrary("Arrays");
    sender = await deployLibrary("Sender");
    revert = await deployLibrary("Revert");
    payable = await deployContract("Payable");
    stateTest = await deployContract("StateTest");

    fallbackContract = await (
      await ethers.getContractFactory("Fallback")
    ).deploy();
    fallback = weiroll.Contract.createContract(fallbackContract);

    eventsContract = await (await ethers.getContractFactory("Events")).deploy();
    events = weiroll.Contract.createLibrary(eventsContract);

    const VM = await ethers.getContractFactory("TestableVM");
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

  it("Should call fallback", async () => {
    const commands = [[fallback, "", "0x2080ffffffffff", "0xff"]];
    const state = ["0x"];

    const tx = await execute(commands, state);
    await expect(tx).to.not.emit(
      fallbackContract.attach(vm.address),
      "LogBytes"
    );

    const receipt = await tx.wait();
    console.log(`fallback: ${receipt.gasUsed.toNumber()} gas`);
  });

  it("Should call fallback with overriden msg.data and msg.value", async () => {
    const commands = [[fallback, "", "0x230081ffffffff", "0xff"]];
    const state = [
      ethers.utils.hexZeroPad(testEtherAmount.toHexString(), "32"),
      hexTestString,
    ];

    const tx = await execute(commands, state, { value: testEtherAmount });
    await expect(tx)
      .to.emit(fallbackContract, "LogUint")
      .withArgs(testEtherAmount);
    await expect(tx)
      .to.emit(fallbackContract, "LogBytes")
      .withArgs(hexTestString);

    const receipt = await tx.wait();
    console.log(
      `fallback (override msg.value & msg.data): ${receipt.gasUsed.toNumber()} gas`
    );
  });

  it("Should override msg.data to call a function", async () => {
    const encodedFunctionCall = events.interface.encodeFunctionData(
      "logString",
      [testString]
    );

    const commands = [[events, "", "0x2080ffffffffff", "0xff"]];
    const state = [encodedFunctionCall];

    const tx = await execute(commands, state);
    await expect(tx)
      .to.emit(eventsContract.attach(vm.address), "LogString")
      .withArgs(testString);

    const receipt = await tx.wait();
    console.log(
      `events (override msg.data to call other function): ${receipt.gasUsed.toNumber()} gas`
    );
  });

  it("Should override msg.data to call a function (js lib)", async () => {
    const encodedFunctionCall = events.interface.encodeFunctionData(
      "fallback",
      [hexTestString]
    );

    const planner = new weiroll.Planner();
    planner.add(
      fallback[""](encodedFunctionCall).withValue(testEtherAmount.sub(10))
    );
    const { commands, state } = planner.plan();

    const tx = await vm.execute(commands, state, { value: testEtherAmount });
    await expect(tx)
      .to.emit(fallbackContract, "LogUint")
      .withArgs(testEtherAmount.sub(10));
    await expect(tx)
      .to.emit(fallbackContract, "LogBytes")
      .withArgs(hexTestString);

    const receipt = await tx.wait();
    console.log(
      `fallback (override msg.data to call other function - js lib): ${receipt.gasUsed.toNumber()} gas`
    );
  });

  it("Should call fallback statically and forward return data", async () => {
    const planner = new weiroll.Planner();

    const msgData = planner.add(fallback[""]().staticcall());
    planner.add(
      weiroll.Contract.createContract(eventsContract)
        [""](msgData)
        .withValue(testEtherAmount)
    );
    const { commands, state } = planner.plan();

    const tx = await vm.execute(commands, state, { value: testEtherAmount });
    await expect(tx)
      .to.emit(eventsContract, "LogUint")
      .withArgs(testEtherAmount);
    await expect(tx)
      .to.emit(eventsContract, "LogBytes")
      .withArgs(
        ethers.utils.defaultAbiCoder.encode(
          ["bytes32", "bytes32"],
          [
            ethers.utils.hexZeroPad(8, 32),
            ethers.utils.formatBytes32String("fallback"),
          ]
        )
      );

    const receipt = await tx.wait();
    console.log(`fallback (staticcall): ${receipt.gasUsed.toNumber()} gas`);
  });

  it("Should call fallback with overriden msg.data & msg.value and forward return data to another fallback", async () => {
    const planner = new weiroll.Planner();

    const msgData = planner.add(
      fallback[""](hexTestString).withValue(testEtherAmount.sub(10))
    );
    planner.add(
      weiroll.Contract.createContract(eventsContract)[""](msgData).withValue(10)
    );
    const { commands, state } = planner.plan();

    const tx = await vm.execute(commands, state, { value: testEtherAmount });
    await expect(tx)
      .to.emit(fallbackContract, "LogUint")
      .withArgs(testEtherAmount.sub(10));
    await expect(tx)
      .to.emit(fallbackContract, "LogBytes")
      .withArgs(hexTestString);
    await expect(tx).to.emit(eventsContract, "LogUint").withArgs(10);
    await expect(tx)
      .to.emit(eventsContract, "LogBytes")
      .withArgs(
        ethers.utils.defaultAbiCoder.encode(
          ["bytes32", "bytes32"],
          [
            ethers.utils.hexZeroPad(8, 32),
            ethers.utils.formatBytes32String("fallback"),
          ]
        )
      );

    const receipt = await tx.wait();
    console.log(
      `fallback (forward return data): ${receipt.gasUsed.toNumber()} gas`
    );
  });

  it("Should call fallback with overriden msg.data & msg.value and forward return data to function *named* fallback", async () => {
    const planner = new weiroll.Planner();

    const msgData = planner.add(
      fallback[""](hexTestString).withValue(testEtherAmount)
    );
    planner.add(
      weiroll.Contract.createContract(eventsContract).fallback(msgData)
    );
    const { commands, state } = planner.plan();

    const tx = await vm.execute(commands, state, { value: testEtherAmount });
    await expect(tx)
      .to.emit(fallbackContract, "LogUint")
      .withArgs(testEtherAmount);
    await expect(tx)
      .to.emit(fallbackContract, "LogBytes")
      .withArgs(hexTestString);
    await expect(tx)
      .to.emit(eventsContract, "LogBytes")
      .withArgs(ethers.utils.hexlify(ethers.utils.toUtf8Bytes("fallback")));

    const receipt = await tx.wait();
    console.log(`fallback (named function): ${receipt.gasUsed.toNumber()} gas`);
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
    console.log(`String concatenation: ${receipt.gasUsed.toNumber()} gas`);
  });

  it("Should execute payable function", async () => {
    const amount = ethers.constants.WeiPerEther.mul(123);
    const planner = new weiroll.Planner();

    planner.add(payable.pay().withValue(amount));
    const balance = planner.add(payable.balance());
    planner.add(
      weiroll.Contract.createContract(eventsContract).logUint(balance)
    );
    const { commands, state } = planner.plan();

    const tx = await vm.execute(commands, state, { value: amount });
    await expect(tx).to.emit(eventsContract, "LogUint").withArgs(amount);
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
      .to.emit(eventsContract.attach(vm.address), "LogString")
      .withArgs("Test");
    await expect(tx)
      .to.emit(eventsContract.attach(vm.address), "LogUint")
      .withArgs(3);
    await expect(tx)
      .to.emit(eventsContract.attach(vm.address), "LogAddress")
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
      .to.emit(eventsContract.attach(vm.address), "LogUint")
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
      .to.emit(eventsContract.attach(vm.address), "LogUint")
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
      .to.emit(eventsContract.attach(vm.address), "LogUint")
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
      .to.emit(eventsContract.attach(vm.address), "LogUint")
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
      .to.emit(eventsContract.attach(vm.address), "LogUint")
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
      .to.emit(eventsContract.attach(vm.address), "LogString")
      .withArgs("Hello world!");

    const receipt = await tx.wait();
    console.log(`nested structs: ${receipt.gasUsed.toNumber()} gas`);
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

  it("Should pass and return raw state to functions", async () => {
    const commands = [
      [stateTest, "addSlots", "0x00000102feffff", "0xfe"],
      [events, "logUint", "0x0000ffffffffff", "0xff"],
    ];
    const state = [
      // dest slot index
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      // src1 slot index
      "0x0000000000000000000000000000000000000000000000000000000000000003",
      // src2 slot index
      "0x0000000000000000000000000000000000000000000000000000000000000004",
      // src1
      "0x0000000000000000000000000000000000000000000000000000000000000001",
      // src2
      "0x0000000000000000000000000000000000000000000000000000000000000002",
    ];

    const tx = await execute(commands, state);
    await expect(tx)
      .to.emit(eventsContract.attach(vm.address), "LogUint")
      .withArgs(
        "0x0000000000000000000000000000000000000000000000000000000000000003"
      );

    const receipt = await tx.wait();
    console.log(`State passing: ${receipt.gasUsed.toNumber()} gas`);
  });

  it("Should perform a ERC20 transfer", async () => {
    let amount = supply.div(10);
    let to = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

    /* transfer some balance to executor */
    let ttx = await token.transfer(vm.address, amount.mul(3));
    /* ensure that transfer was successful */
    await expect(ttx)
      .to.emit(token, "Transfer")
      .withArgs(to, vm.address, amount.mul(3));

    const commands = [[token, "transfer", "0x010001ffffffff", "0xff"]];
    const state = [
      // dest slot index
      "0x000000000000000000000000" + to.slice(2),
      // amt slot index
      ethers.utils.hexZeroPad("0x01", 32),
      // ret slot index
      "0x0000000000000000000000000000000000000000000000000000000000000000",
    ];

    const tx = await execute(commands, state);
    await expect(tx).to.emit(token, "Transfer").withArgs(vm.address, to, "0x1");

    const receipt = await tx.wait();
    console.log(`Direct ERC20 transfer: ${receipt.gasUsed.toNumber()} gas`);
  });

  it("Should propagate revert reasons", async () => {
    const planner = new weiroll.Planner();

    planner.add(revert.fail());
    const { commands, state } = planner.plan();

    await expect(vm.execute(commands, state)).to.be.revertedWith(
      `ExecutionFailed(0, "${revert.address}", "Hello World!")`
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
});
