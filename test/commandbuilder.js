const { expect } = require("chai");
const { ethers } = require("hardhat");
const weiroll = require("@ensofinance/weiroll.js");

async function deployLibrary(name) {
  const factory = await ethers.getContractFactory(name);
  const contract = await factory.deploy();
  return weiroll.Contract.createLibrary(contract);
}

describe("CommandBuilder", function () {
  let cbh;
  let math;
  let strings;
  let struct;
  let fixed;
  let arrays;
  let params;
  let abi = ethers.utils.defaultAbiCoder;

  before(async () => {
    const Cbh = await ethers.getContractFactory("CommandBuilderHarness");
    cbh = await Cbh.deploy();

    math = await deployLibrary("Math");
    strings = await deployLibrary("Strings");
    struct = await deployLibrary("Struct");
    fixed = await deployLibrary("Fixed");
    arrays = await deployLibrary("Arrays");
    params = await deployLibrary("Params");
  });

  async function executeBuildInputs(commands, state, abiout, msg){
    for (let i = 0; i < commands.length; i++) {
        const c = commands[i]
        selector = ethers.utils.hexDataSlice(c, 0, 4);
        flags = ethers.utils.hexDataSlice(c, 4, 5);
        let indicesLength;
        if (flags == "0x40") {
          i++;
          indices = commands[i];
          indicesLength = 32;
        } else {
          indices = ethers.utils.hexConcat([ethers.utils.hexDataSlice(c, 5, 5+6), "0xffffffffffffffffffffffffffffffffffffffffffffffffffff"]);
          indicesLength = 6;
        }

        target = ethers.utils.hexDataSlice(c, 5+6);
        const txBaseGasNoArgs = await cbh.estimateGas.basecall();
        const txBaseGas = await cbh.estimateGas.testBuildInputsBaseGas(
          state,
          selector,
          indices,
          indicesLength
        );
        const txGas = await cbh.estimateGas.testBuildInputs(
          state,
          selector,
          indices,
          indicesLength
        );
        console.log(
          `buildInputs gas cost: ${txGas
            .sub(txBaseGas)
            .toString()} - argument passing cost: ${txBaseGas
            .sub(txBaseGasNoArgs)
            .toNumber()} - total: ${txGas.toNumber()}`
        );
        const result = await cbh.testBuildInputs(state, selector, indices, indicesLength);
        expect(result).to.equal(selector + abiout.slice(2));
    }
  }

  it("Should build inputs that match Math.add ABI", async () => {
    const planner = new weiroll.Planner();

    let args = [1, 2];

    abiout = abi.encode(math.interface.getFunction("add").inputs, args);

    planner.add(math.add(...args));

    const { commands, state } = planner.plan();

    await executeBuildInputs(commands, state, abiout, "Math.add");
  });

  it("Should build inputs that match Strings.strcat ABI", async () => {
    const planner = new weiroll.Planner();

    let args = ["Hello", " World!"];

    abiout = abi.encode(strings.interface.getFunction("strcat").inputs, args);

    planner.add(strings.strcat(...args));

    const { commands, state } = planner.plan();

    await executeBuildInputs(commands, state, abiout, "Strings.strcat");

  });

  it("Should build inputs that match Strings.strlen ABI", async () => {
    const planner = new weiroll.Planner();

    let args = ["Hello World!"];

    abiout = abi.encode(strings.interface.getFunction("strlen").inputs, args);

    planner.add(strings.strlen(...args));

    const {commands, state} = planner.plan();

    await executeBuildInputs(commands, state, abiout, "Strings.strlen");

  });

  it("Should build inputs that match Arrays.returnStringArrayLength ABI", async () => {
    const planner = new weiroll.Planner();

    let args = [["Hello","World"]];

    abiout = abi.encode(arrays.interface.getFunction("returnStringArrayLength").inputs, args);

    planner.add(arrays.returnStringArrayLength(...args));

    const {commands, state} = planner.plan();

    await executeBuildInputs(commands, state, abiout, "Arrays.returnStringArrayLength");

  });

  it("Should build inputs that match Struct.returnStringStruct ABI", async () => {
    const planner = new weiroll.Planner();

    let args = [{ a: "Hello", b: "World"}];

    abiout = abi.encode(struct.interface.getFunction("returnStringStruct").inputs, args);

    planner.add(struct.returnStringStruct(...args));

    const {commands, state} = planner.plan();

    await executeBuildInputs(commands, state, abiout, "Struct.returnStringStruct");

  });

  it("Should build inputs that match Struct.returnComplexStruct ABI", async () => {
    const planner = new weiroll.Planner();

    let args = [
      {
        id: "0xdadadadadadadadadadadadadadadadadadadadadadadadadadadadadadadada",
        category: 1,
        from: "0x1212121212121212121212121212121212121212",
        to: "0x1313131313131313131313131313131313131313",
        amount: 1000,
        data: "0xbebebebe"
      },
      {
        from: "0x1414141414141414141414141414141414141414",
        approvedFrom: false,
        to: "0x1515151515151515151515151515151515151515",
        approvedTo: false
      },
      0,
      ethers.constants.MaxUint256
    ];

    abiout = abi.encode(struct.interface.getFunction("returnComplexStruct").inputs, args);

    planner.add(struct.returnComplexStruct(...args));

    const {commands, state} = planner.plan();

    await executeBuildInputs(commands, state, abiout, "Struct.returnComplexStruct");

  });

  it("Should build inputs that match Struct.returnMultiStructArray ABI", async () => {
    const planner = new weiroll.Planner();

    let args = [[
      {
        a: "0x1010101010101010101010101010101010101010",
        b: "0x1111111111111111111111111111111111111111",
        d: {
          id: "0xdadadadadadadadadadadadadadadadadadadadadadadadadadadadadadadada",
          category: 1,
          from: "0x1212121212121212121212121212121212121212",
          to: "0x1313131313131313131313131313131313131313",
          amount: 1000,
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
          amount: 1000,
          data: "0xbebebebe"
        }
      }
    ]];

    abiout = abi.encode(struct.interface.getFunction("returnMultiStructArray").inputs, args);

    planner.add(struct.returnMultiStructArray(...args));

    const {commands, state} = planner.plan();

    await executeBuildInputs(commands, state, abiout, "Struct.returnMultiStructArray");

  });

  it("Should build inputs that match Fixed.addStruct ABI", async () => {
    const planner = new weiroll.Planner();

    let args = [{ a: 1, b: 2}];

    abiout = abi.encode(fixed.interface.getFunction("addStruct").inputs, args);

    planner.add(fixed.addStruct(...args));

    const {commands, state} = planner.plan();

    await executeBuildInputs(commands, state, abiout, "Fixed.addStruct");

  });

  it("Should build inputs that match Struct.returnMixedStruct ABI", async () => {
    const planner = new weiroll.Planner();

    let args = [{ a: 1, b: cbh.address}];

    abiout = abi.encode(struct.interface.getFunction("returnMixedStruct").inputs, args);

    planner.add(struct.returnMixedStruct(...args));

    const {commands, state} = planner.plan();

    await executeBuildInputs(commands, state, abiout, "Struct.returnMixedStruct");

  });

  it("Should build inputs that match Struct.returnParamAndStruct ABI", async () => {
    const planner = new weiroll.Planner();

    let args = [3, { a: 1, b: cbh.address}];

    abiout = abi.encode(struct.interface.getFunction("returnParamAndStruct").inputs, args);

    planner.add(struct.returnParamAndStruct(...args));

    const {commands, state} = planner.plan();

    await executeBuildInputs(commands, state, abiout, "Struct.returnParamAndStruct");

  });

  it("Should build inputs that match Struct.returnDynamicParamAndStruct ABI", async () => {
    const planner = new weiroll.Planner();

    let args = ["Test", { a: 1, b: cbh.address}];

    abiout = abi.encode(struct.interface.getFunction("returnDynamicParamAndStruct").inputs, args);

    planner.add(struct.returnDynamicParamAndStruct(...args));

    const {commands, state} = planner.plan();

    await executeBuildInputs(commands, state, abiout, "Struct.returnDynamicParamAndStruct");

  });

  it("Should build inputs that match Math.sum ABI", async () => {
    const planner = new weiroll.Planner();

    let args = [
      ethers.BigNumber.from(
        "0xAAA0000000000000000000000000000000000000000000000000000000000002"
      ),
      ethers.BigNumber.from(
        "0x1111111111111111111111111111111111111111111111111111111111111111"
      ),
      ethers.BigNumber.from(
        "0x2222222222222222222222222222222222222222222222222222222222222222"
      ),
    ];

    abiout = abi.encode(math.interface.getFunction("sum").inputs, [args]);

    planner.add(math.sum(args));

    const { commands, state } = planner.plan();

    await executeBuildInputs(commands, state, abiout, "Math.sum");
  });

  it("Should build inputs that match Arrays.sumAndMultiply ABI", async () => {
    const planner = new weiroll.Planner();

    let args1 = [
      ethers.BigNumber.from("0xAAA0000000000000000000000000000000000000000000000000000000000002"),
      ethers.BigNumber.from("0x1111111111111111111111111111111111111111111111111111111111111111"),
      ethers.BigNumber.from("0x2222222222222222222222222222222222222222222222222222222222222222")
    ];

    let args2 = [
      ethers.BigNumber.from("0xAAA0000000000000000000000000000000000000000000000000000000000002"),
      ethers.BigNumber.from("0x1111111111111111111111111111111111111111111111111111111111111111"),
      ethers.BigNumber.from("0x2222222222222222222222222222222222222222222222222222222222222222")
    ];

    abiout = abi.encode(arrays.interface.getFunction("sumAndMultiply").inputs, [args1, args2]);

    planner.add(arrays.sumAndMultiply(args1, args2));

    const {commands, state} = planner.plan();

    await executeBuildInputs(commands, state, abiout, "Math.sumAndMultiply");

  });

  it("Should build inputs that match Fixed.addArray ABI", async () => {
    const planner = new weiroll.Planner();

    let args = [
      ethers.BigNumber.from("0xAAA0000000000000000000000000000000000000000000000000000000000002"),
      ethers.BigNumber.from("0x1111111111111111111111111111111111111111111111111111111111111111")
    ];

    abiout = abi.encode(fixed.interface.getFunction("addArray").inputs, [args]);

    planner.add(fixed.addArray(args));

    const {commands, state} = planner.plan();

    await executeBuildInputs(commands, state, abiout, "Fixed.addArray");

  });

  it("Should select and overwrite first 32 byte slot in state for output (static test)", async () => {
    let state = [
      "0x000000000000000000000000000000000000000000000000000000000000000a",
      "0x1111111111111111111111111111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222222222222222222222222222",
    ];

    let index = "0x00";

    let output =
      "0x0000000000000000000000000000000000000000000000000000000000000000";

    const txBaseGas = await cbh.estimateGas.testWriteOutputsBaseGas(
      state,
      index,
      output
    );
    const txGas = await cbh.estimateGas.testWriteOutputs(state, index, output);
    console.log("writeOutputs gas cost: ", txGas.sub(txBaseGas).toString());
    const tx = await cbh.testWriteOutputs(state, index, output);

    state[0] = output;

    expect(tx).to.deep.equal([state, output]);
  });

  it("Should select and overwrite second dynamic amount bytes in second state slot given a uint[] output (dynamic test)", async () => {
    let state = [
      "0x000000000000000000000000000000000000000000000000000000000000000a",
      "0x1111111111111111111111111111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222222222222222222222222222",
    ];

    let index = "0x81";

    let output = abi.encode(["uint[]"], [[1, 2, 3]]);

    const txBaseGas = await cbh.estimateGas.testWriteOutputsBaseGas(
      state,
      index,
      output
    );
    const txGas = await cbh.estimateGas.testWriteOutputs(state, index, output);
    console.log("writeOutputs gas cost: ", txGas.sub(txBaseGas).toString());
    const tx = await cbh.testWriteOutputs(state, index, output);

    state[1] = ethers.utils.hexDataSlice(output, 32);

    expect(tx[0]).to.deep.equal(state);
  });

  it("Should overwrite entire state with *abi decoded* output value (rawcall)", async () => {
    let state = [
      "0x000000000000000000000000000000000000000000000000000000000000000a",
      "0x1111111111111111111111111111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222222222222222222222222222",
    ];

    let index = "0xfe";

    let precoded = ["0x11", "0x22", "0x33"];

    let output = abi.encode(["bytes[]"], [precoded]);

    const txBaseGas = await cbh.estimateGas.testWriteOutputsBaseGas(
      state,
      index,
      output
    );
    const txGas = await cbh.estimateGas.testWriteOutputs(state, index, output);
    console.log("writeOutputs gas cost: ", txGas.sub(txBaseGas).toString());
    const tx = await cbh.testWriteOutputs(state, index, output);

    expect(tx).to.deep.equal([precoded, output]);
  });

  it("Should revert because index is out-of-bounds", async () => {
    let state = [
      "0x000000000000000000000000000000000000000000000000000000000000000a",
      "0x1111111111111111111111111111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222222222222222222222222222",
    ];

    let index = "0x83";

    let output = abi.encode(["uint[]"], [[1, 2, 3]]);

   await expect(cbh.testWriteOutputs(state, index, output)).to.be.revertedWith("Index out-of-bounds");
  });

  it("Should build short command with 6 inputs", async () => {
    const planner = new weiroll.Planner();

    let args = [1, 2, 3, 4, 5, 6];

    abiout = abi.encode(params.interface.getFunction("param6").inputs, args);

    planner.add(params.param6(...args));

    const { commands, state } = planner.plan();

    expect(commands.length).to.equal(1)

    await executeBuildInputs(commands, state, abiout, "Params.param6");
  });

  it("Should build extended command with 7 inputs", async () => {
    const planner = new weiroll.Planner();

    let args = [1, 2, 3, 4, 5, 6, 7];

    abiout = abi.encode(params.interface.getFunction("param7").inputs, args);

    planner.add(params.param7(...args));

    const { commands, state } = planner.plan();

    expect(commands.length).to.equal(2)

    await executeBuildInputs(commands, state, abiout, "Params.param7");
  });

  it("Should build extended command with 32 inputs", async () => {
    const planner = new weiroll.Planner();

    let args = [1, 2, 3, 4, 5, 6, 7, 8 , 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];

    abiout = abi.encode(params.interface.getFunction("param32").inputs, args);

    planner.add(params.param32(...args));

    const { commands, state } = planner.plan();

    expect(commands.length).to.equal(2)

    await executeBuildInputs(commands, state, abiout, "Params.param32");
  });

  it("Should fail to build extended command with 33 inputs", async () => {
    const planner = new weiroll.Planner();

    let args = [1, 2, 3, 4, 5, 6, 7, 8 , 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33];

    abiout = abi.encode(params.interface.getFunction("param33").inputs, args);

    planner.add(params.param33(...args));
    try {
      const { commands, state } = planner.plan();
      // This code should not be reached since the planner will fail
      expect(true).to.equal(false)
    } catch (e) {
      expect(e.message).to.have.string('Invalid array length')
    }
  });
});