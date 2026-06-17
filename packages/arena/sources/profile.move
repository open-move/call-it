/// Arena creator profile state and capability.
module arena::profile;

use sui::{
    clock::Clock,
    object::{Self, ID, UID},
    transfer,
};

const MAX_METADATA_HASH_BYTES: u64 = 128;

#[error]
const EInvalidMetadata: vector<u8> = b"Profile metadata hash must be non-empty and bounded";

#[error]
const EWrongCreatorProfileCap: vector<u8> = b"Creator cap does not match profile";

#[error]
const ENotCreator: vector<u8> = b"Only the profile creator can perform this action";

public struct CreatorProfile has key {
    id: UID,
    win_count: u64,
    call_count: u64,
    created_at_ms: u64,
    settled_count: u64,
    creator: address,
    metadata_hash: vector<u8>,
}

public struct CreatorProfileCap has key, store {
    id: UID,
    profile_id: ID,
}

public(package) fun new(
    creator: address,
    metadata_hash: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
): (CreatorProfile, CreatorProfileCap) {
    assert_valid_metadata(&metadata_hash);

    let created_at_ms = clock.timestamp_ms();
    let profile = CreatorProfile {
        id: object::new(ctx),
        creator,
        metadata_hash,
        created_at_ms,
        call_count: 0,
        settled_count: 0,
        win_count: 0,
    };

    let profile_cap = CreatorProfileCap { 
        id: object::new(ctx), 
        profile_id: profile.id.to_inner() 
    };
    (profile, profile_cap)
}

public(package) fun share(profile: CreatorProfile) {
    transfer::share_object(profile);
}

public(package) fun assert_creator(profile: &CreatorProfile, cap: &CreatorProfileCap, sender: address) {
    assert!(profile.id.to_inner() == cap.profile_id, EWrongCreatorProfileCap);
    assert!(profile.creator == sender, ENotCreator);
}

public(package) fun increment_call_count(profile: &mut CreatorProfile) {
    profile.call_count = profile.call_count + 1;
}

public(package) fun record_settlement(profile: &mut CreatorProfile, won: bool) {
    profile.settled_count = profile.settled_count + 1;
    if (won) {
        profile.win_count = profile.win_count + 1;
    };
}

public(package) fun assert_profile_id(profile: &CreatorProfile, profile_id: ID) {
    assert!(profile.id.to_inner() == profile_id, EWrongCreatorProfileCap);
}

public fun id(profile: &CreatorProfile): ID {
    profile.id.to_inner()
}

public fun creator(profile: &CreatorProfile): address {
    profile.creator
}

public fun metadata_hash(profile: &CreatorProfile): vector<u8> {
    profile.metadata_hash
}

public fun created_at_ms(profile: &CreatorProfile): u64 {
    profile.created_at_ms
}

public fun call_count(profile: &CreatorProfile): u64 {
    profile.call_count
}

public fun settled_count(profile: &CreatorProfile): u64 {
    profile.settled_count
}

public fun win_count(profile: &CreatorProfile): u64 {
    profile.win_count
}

public fun cap_profile_id(cap: &CreatorProfileCap): ID {
    cap.profile_id
}

public fun cap_id(cap: &CreatorProfileCap): ID {
    cap.id.to_inner()
}

fun assert_valid_metadata(metadata_hash: &vector<u8>) {
    let length = metadata_hash.length();
    assert!(length > 0 && length <= MAX_METADATA_HASH_BYTES, EInvalidMetadata);
}
