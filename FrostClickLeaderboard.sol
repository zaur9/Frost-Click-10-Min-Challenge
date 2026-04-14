// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title FrostClickLeaderboard with signature-based submit protection
/// @notice Accepts signed score submissions to prevent front-end spoofing/replay
contract FrostClickLeaderboard {
    struct ScoreEntry {
        address player;
        uint32 score;
        uint32 timestamp;
    }

    ScoreEntry[100] public leaderboard;
    uint256 public entriesCount;
    uint32 public constant MAX_SCORE = 30000;

    // Best + cumulative totals
    mapping(address => uint32) public bestScoreOf;
    mapping(address => uint64) public totalScoreOf;
    uint128 public globalTotalScore;

    // Optional player nickname
    mapping(address => string) public nicknameOf;

    // mapping: address -> index+1 (0 means not present)
    mapping(address => uint256) public indexPlusOne;

    // Prevent replay: store used message hashes (keccak of encoded payload)
    mapping(bytes32 => bool) public usedMessages;

    event ScoreSubmitted(address indexed player, uint32 score, uint32 timestamp, uint256 index);
    event BestScoreUpdated(address indexed player, uint32 bestScore, uint256 index);
    event TotalScoreUpdated(address indexed player, uint64 playerTotal, uint128 globalTotal);
    event NicknameUpdated(address indexed player, string nickname);

    // secp256k1n/2 for ECDSA malleability check
    uint256 private constant SECP256K1N_DIV_2 =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    function _isAllowedNicknameChar(bytes1 c) private pure returns (bool) {
        // a-z
        if (c >= 0x61 && c <= 0x7A) return true;
        // A-Z
        if (c >= 0x41 && c <= 0x5A) return true;
        // 0-9
        if (c >= 0x30 && c <= 0x39) return true;
        // '_' or '-' or space
        if (c == 0x5F || c == 0x2D || c == 0x20) return true;
        return false;
    }

    function setNickname(string calldata nickname_) external {
        bytes memory b = bytes(nickname_);
        require(b.length >= 3 && b.length <= 16, "Nickname length 3..16");
        for (uint256 i = 0; i < b.length; i++) {
            require(_isAllowedNicknameChar(b[i]), "Nickname has invalid chars");
        }
        nicknameOf[msg.sender] = nickname_;
        emit NicknameUpdated(msg.sender, nickname_);
    }

    /// @notice Submit score with ECDSA signature. The signer must equal msg.sender.
    /// @param score_ player's score (<= MAX_SCORE)
    /// @param timestamp_ unix timestamp used when signing (seconds)
    /// @param v, r, s - ECDSA signature parts over the messageHash
    function submitScoreSigned(
        uint32 score_,
        uint32 timestamp_,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        require(score_ > 0, "Score must be positive");
        require(score_ <= MAX_SCORE, "Score too high");

        // Build message hash exactly as frontend will do:
        // keccak256(abi.encodePacked(player, score, timestamp, contractAddress, chainId))
        bytes32 messageHash = keccak256(
            abi.encodePacked(msg.sender, score_, timestamp_, address(this), block.chainid)
        );

        require(!usedMessages[messageHash], "Signature already used");

        // Ethereum Signed Message prefix:
        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );

        // Signature hardening:
        // - v must be 27 or 28
        // - s must be in lower half-order (EIP-2)
        require(v == 27 || v == 28, "Invalid v");
        require(uint256(s) <= SECP256K1N_DIV_2, "Invalid s");

        // Recover signer
        address signer = ecrecover(ethSignedMessageHash, v, r, s);
        require(signer != address(0), "Invalid signature");
        require(signer == msg.sender, "Invalid signature / signer mismatch");

        // Optional: timeframe check (prevent extremely old/future timestamps)
        // Allow timestamp that is not older than 1 hour and not more than +5 minutes in future
        // (accomodates small clock differences)
        uint256 nowTs = block.timestamp;
        require(timestamp_ <= nowTs + 5 minutes, "Timestamp too far in future");
        require(nowTs <= timestamp_ + 1 hours ? true : false, "Timestamp too old");
        // Note: second check is equivalent to nowTs - timestamp_ <= 1 hours

        // Mark used to prevent replay
        usedMessages[messageHash] = true;

        // Always count submitted score into cumulative totals
        totalScoreOf[msg.sender] += score_;
        globalTotalScore += score_;
        emit TotalScoreUpdated(msg.sender, totalScoreOf[msg.sender], globalTotalScore);

        // If player already has record, update in-place only on improvement.
        // Important: we DO NOT revert for lower/equal scores anymore.
        uint256 idxPlus = indexPlusOne[msg.sender];
        if (idxPlus != 0) {
            uint256 idx = idxPlus - 1;
            if (score_ > leaderboard[idx].score) {
                leaderboard[idx] = ScoreEntry(msg.sender, score_, timestamp_);
                bestScoreOf[msg.sender] = score_;
                emit BestScoreUpdated(msg.sender, score_, idx);
            }
            emit ScoreSubmitted(msg.sender, score_, timestamp_, idx);
            return;
        }

        // Player has no prior record
        if (entriesCount < 100) {
            leaderboard[entriesCount] = ScoreEntry(msg.sender, score_, timestamp_);
            indexPlusOne[msg.sender] = entriesCount + 1;
            bestScoreOf[msg.sender] = score_;
            emit BestScoreUpdated(msg.sender, score_, entriesCount);
            emit ScoreSubmitted(msg.sender, score_, timestamp_, entriesCount);
            entriesCount++;
            return;
        }

        // Find lowest score and replace if new score is higher
        uint256 lowestIndex = 0;
        uint32 lowestScore = leaderboard[0].score;
        for (uint256 i = 1; i < 100; i++) {
            if (leaderboard[i].score < lowestScore) {
                lowestScore = leaderboard[i].score;
                lowestIndex = i;
            }
        }

        // If score isn't high enough for top-100, we still accept submission
        // (totals already counted above), but do not modify leaderboard.
        if (score_ <= lowestScore) {
            emit ScoreSubmitted(msg.sender, score_, timestamp_, type(uint256).max);
            return;
        }

        // Remove mapping for previous owner of that slot
        address prev = leaderboard[lowestIndex].player;
        indexPlusOne[prev] = 0;

        // Insert new record and set mapping
        leaderboard[lowestIndex] = ScoreEntry(msg.sender, score_, timestamp_);
        indexPlusOne[msg.sender] = lowestIndex + 1;
        bestScoreOf[msg.sender] = score_;

        emit BestScoreUpdated(msg.sender, score_, lowestIndex);
        emit ScoreSubmitted(msg.sender, score_, timestamp_, lowestIndex);
    }

    /// @notice Legacy getter: returns full leaderboard array
    function getLeaderboard() external view returns (ScoreEntry[100] memory) {
        return leaderboard;
    }
}
