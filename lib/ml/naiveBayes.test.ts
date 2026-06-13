import { describe, it, expect } from "vitest";
import { tokenize, trainNB, predictNB } from "./naiveBayes";

describe("tokenize", () => {
  it("produces unigrams and adjacent bigrams", () => {
    expect(tokenize("book a cut")).toEqual(["book", "a", "cut", "book_a", "a_cut"]);
  });
  it("lowercases and drops punctuation", () => {
    expect(tokenize("Cancel, please!")).toEqual(["cancel", "please", "cancel_please"]);
  });
});

describe("Multinomial NB", () => {
  const docs = [
    { tokens: tokenize("cancel my booking"), label: "CANCEL" },
    { tokens: tokenize("cancel my appointment"), label: "CANCEL" },
    { tokens: tokenize("please cancel that"), label: "CANCEL" },
    { tokens: tokenize("book a haircut"), label: "BOOK" },
    { tokens: tokenize("book an appointment"), label: "BOOK" },
    { tokens: tokenize("i want a haircut"), label: "BOOK" },
  ];

  it("classifies a held-out example by its strongest signal", () => {
    const model = trainNB(docs);
    expect(predictNB(model, tokenize("cancel it"))).toBe("CANCEL");
    expect(predictNB(model, tokenize("book a cut"))).toBe("BOOK");
  });

  it("falls back to the prior when all tokens are out-of-vocab", () => {
    const model = trainNB(docs);
    // No shared tokens → prior decides; classes are balanced 3/3 so it just
    // returns a valid class without throwing.
    expect(["CANCEL", "BOOK"]).toContain(predictNB(model, tokenize("xyzzy qux")));
  });
});
