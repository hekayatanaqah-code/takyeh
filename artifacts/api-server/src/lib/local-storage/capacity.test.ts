import {test} from "node:test";
import assert from "node:assert/strict";
import {assertUploadCapacity,StorageCapacityError} from "./capacity";

const MIB=1024*1024;
const stats=(freeMiB:number)=>({bavail:freeMiB*256,bsize:4096,blocks:262144});

test("known uploads reserve their actual size, not a fixed 128 MiB",()=>{
  assert.doesNotThrow(()=>assertUploadCapacity(stats(100),256*MIB,30090860));
  assert.throws(()=>assertUploadCapacity(stats(90),256*MIB,30090860),(error:unknown)=>{
    assert.ok(error instanceof StorageCapacityError);
    assert.equal(error.availableBytes,90*MIB);
    assert.equal(error.requiredBytes,30090860+64*MIB);
    return true;
  });
});

test("200 MiB uploads require capacity for the entire file and reserve",()=>{
  assert.throws(()=>assertUploadCapacity(stats(263),256*MIB,200*MIB),StorageCapacityError);
  assert.doesNotThrow(()=>assertUploadCapacity(stats(264),256*MIB,200*MIB));
  assert.throws(()=>assertUploadCapacity(stats(1000),256*MIB,257*MIB),/Invalid upload length/);
  assert.throws(()=>assertUploadCapacity(stats(1000),256*MIB,NaN),/Invalid upload length/);
});

test("unknown-length streams keep the existing preflight reserve",()=>{
  assert.throws(()=>assertUploadCapacity(stats(127),256*MIB),StorageCapacityError);
  assert.doesNotThrow(()=>assertUploadCapacity(stats(128),256*MIB));
});
