import assert from "node:assert/strict";

import { derivePublicTagCategory } from "./tag-category";

function runTests() {
  assert.equal(derivePublicTagCategory("FLOW", "IN", "NORMAL"), "FLOW_IN");
  assert.equal(derivePublicTagCategory("FLOW", "OUT", "NORMAL"), "FLOW_OUT");
  assert.equal(derivePublicTagCategory("PRESSURE", "IN", "NORMAL"), "PRESSURE_IN");
  assert.equal(derivePublicTagCategory("PRESSURE", "OUT", "NORMAL"), "PRESSURE_OUT");
  assert.equal(derivePublicTagCategory("PRESSURE", "IN", "MAX"), "PRESSURE_IN_MAX");
  assert.equal(derivePublicTagCategory("PRESSURE", "OUT", "MAX"), "PRESSURE_OUT_MAX");
  assert.equal(derivePublicTagCategory("LEVEL", "NONE", "NORMAL"), "LEVEL");
  assert.equal(derivePublicTagCategory("VOLUME", "NONE", "NORMAL"), "VOLUME");
  assert.equal(derivePublicTagCategory("SELECTOR", "S_E", "NORMAL"), "SELECTOR_S_E");

  assert.throws(
    () => derivePublicTagCategory("FLOW", "NONE", "MAX"),
    /Unsupported tag category combination: FLOW\|NONE\|MAX/
  );

  assert.notEqual("FLOW_NONE_MAX", "FLOW_IN");
  assert.notEqual("FLOW_NONE_MAX", "FLOW_OUT");

  assert.throws(
    () => derivePublicTagCategory("SELECTOR", "OUT", "MAX"),
    /Unsupported tag category combination: SELECTOR\|OUT\|MAX/
  );

  console.log("tag-category tests: OK");
}

runTests();
