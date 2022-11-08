// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../Libraries/Events.sol";
import "../Libraries/Math.sol";

contract Struct is Events, Math {
    struct StringStruct {
      string a;
      string b;
    }

    struct MixedStruct {
      uint256 a;
      address b;
    }

    struct DataStruct {
      bytes32 id;
      uint256 category;
      address from;
      address to;
      uint256 amount;
      bytes data;
    }

    struct UserStruct {
      address from;
      bool approvedTo;
      address to;
      bool approvedFrom;
    }

    struct MultiStruct {
      address a;
      address b;
      DataStruct d;
    }

    struct ArrayStruct {
      address a;
      uint256[] values;
    }

    struct StringMultiStruct {
      uint256 a;
      StringStruct b;
    }

    struct NestedStruct1 {
      uint256 a;
      StringMultiStruct b;
    }

    struct NestedStruct2 {
      uint256 a;
      NestedStruct1 b;
    }

    struct NestedStruct3 {
      uint256 a;
      NestedStruct2 b;
    }


    function returnStringStruct(StringStruct memory values)
        external
        pure
        returns (string memory, string memory)
    {
        return (values.a, values.b);
    }

    function returnMixedStruct(MixedStruct memory values)
        external
        pure
        returns (uint256, address)
    {
        return (values.a, values.b);
    }


    function returnParamAndStruct(uint256 param, MixedStruct memory values)
        external
        pure
        returns (uint256, uint256, address)
    {
        return (param, values.a, values.b);
    }

    function returnDynamicParamAndStruct(string memory param, MixedStruct memory values)
        external
        returns (string memory, uint256, address)
    {
        emit LogString(param);
        emit LogUint(values.a);
        emit LogAddress(values.b);
        return (param, values.a, values.b);
    }

    function returnComplexStruct(
        DataStruct memory dataStruct,
        UserStruct memory userStruct,
        uint256 amount,
        uint256 timestamp
    )
        external
        pure
        returns (bytes32)
    {
        return dataStruct.id;
    }

    function returnMultiStructArray(
        MultiStruct[] memory multiStructs
    )
        external
        returns (uint256, bytes32)
    {
        emit LogUint(multiStructs[0].d.amount);
        return (multiStructs.length, multiStructs[0].d.id);
    }

    function returnNestedStructString(
        NestedStruct3 memory nestedStruct
    )
        external
        returns (string memory)
    {
        emit LogString(nestedStruct.b.b.b.b.a);
        return nestedStruct.b.b.b.b.a;
    }

    function returnArrayStructSum(
        ArrayStruct memory arrayStruct
    )
        external
        returns (uint256)
    {
        uint256 total = sum(arrayStruct.values);
        emit LogUint(total);
        return total;
    }
}
