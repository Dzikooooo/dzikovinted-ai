import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { describeTimeout, waitForCondition, waitForElement, WaitTimeoutError } from "../domWait";

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("waitForElement", () => {
  it("resolves immediately if the element already exists", async () => {
    document.body.innerHTML = '<div id="already-here"></div>';
    const el = await waitForElement("#already-here", { timeoutMs: 500 });
    expect(el.id).toBe("already-here");
  });

  it("resolves as soon as the element is added to the DOM", async () => {
    const promise = waitForElement("#added-later", { timeoutMs: 2000 });
    setTimeout(() => {
      const el = document.createElement("div");
      el.id = "added-later";
      document.body.appendChild(el);
    }, 20);
    const el = await promise;
    expect(el.id).toBe("added-later");
  });

  it("rejects with WaitTimeoutError if the element never appears", async () => {
    await expect(waitForElement("#never", { timeoutMs: 50 })).rejects.toBeInstanceOf(WaitTimeoutError);
  });
});

describe("waitForCondition", () => {
  it("resolves immediately if the predicate is already true", async () => {
    await expect(waitForCondition(() => true, { timeoutMs: 500 })).resolves.toBeUndefined();
  });

  it("resolves once a DOM mutation makes the predicate true", async () => {
    const promise = waitForCondition(() => document.querySelectorAll("span").length === 3, { timeoutMs: 2000 });
    setTimeout(() => {
      for (let i = 0; i < 3; i++) document.body.appendChild(document.createElement("span"));
    }, 20);
    await expect(promise).resolves.toBeUndefined();
  });

  it("rejects with WaitTimeoutError if the predicate never becomes true", async () => {
    await expect(waitForCondition(() => false, { timeoutMs: 50 })).rejects.toBeInstanceOf(WaitTimeoutError);
  });
});

describe("describeTimeout", () => {
  it("leads with a human-readable message and preserves the raw detail", () => {
    const err = new WaitTimeoutError('waitForElement: délai dépassé (8000ms) pour "[data-testid=x]"');
    const result = describeTimeout(err);
    expect(result.startsWith("La page Vinted n'a pas répondu à temps.")).toBe(true);
    expect(result).toContain('[data-testid=x]');
  });
});
