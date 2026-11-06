// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {GarudaSignatureSeaportZoneV2} from "../src/GarudaSignatureSeaportZoneV2.sol";

interface DeploymentVm {
    function envAddress(string calldata) external returns (address);
    function startBroadcast(address) external;
    function stopBroadcast() external;
}

/// @notice Ethereum-only validator deployment. Canonical Seaport already exists; no activation included.
contract DeployGarudaV2 {
    DeploymentVm private constant vm = DeploymentVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (GarudaSignatureSeaportZoneV2 zone) {
        require(block.chainid == 1, "Ethereum only");
        address deployer = vm.envAddress("GARUDA_DEPLOYER");
        address guardian = vm.envAddress("GARUDA_GUARDIAN");
        require(deployer != address(0) && guardian != address(0), "Public addresses required");
        vm.startBroadcast(deployer);
        zone = new GarudaSignatureSeaportZoneV2(
            0x48791DbDFB38bAA58e48329148C321bF33B3c1e1,
            0x66a0f676479Cee1d7373f3DC2e2952778BfF5bd6,
            0xe939551e67d3f4ecb2be3fa2efccfb5cb45175fd254314d7ae0abd5084cd38ec,
            0x9a28e2f3ce7205c62916af26dc863137062ca1fe8e8ac07a9c757ab30f9c3624,
            0x74499ac0cce14428e4b41541d5e44f28f5a6882a1051d0118867c2a93cd5aec0,
            guardian,
            50,
            0xB8d92F2E8D1A98c18cDe85e49a0F11e3c64D0a68
        );
        vm.stopBroadcast();
        require(zone.newActivityPaused() && zone.owner() == guardian, "Unexpected deployment state");
    }
}
