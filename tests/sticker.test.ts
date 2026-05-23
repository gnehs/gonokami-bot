import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMoodQuery } from "../utils/sticker.ts";

test("normalizeMoodQuery maps Chinese moods to canonical tags", () => {
  assert.deepEqual(normalizeMoodQuery("笑死"), ["laugh"]);
  assert.deepEqual(normalizeMoodQuery("尷尬"), ["awkward"]);
  assert.deepEqual(normalizeMoodQuery("生氣"), ["angry"]);
});

test("normalizeMoodQuery keeps unknown moods as searchable tags", () => {
  assert.deepEqual(normalizeMoodQuery("榮勾斯揪"), ["榮勾斯揪"]);
});
