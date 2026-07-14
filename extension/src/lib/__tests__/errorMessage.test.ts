import { describe, it, expect } from "vitest";
import { errorMessage } from "../errorMessage";

describe("errorMessage", () => {
  it("extrait le message d'une instance Error", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
  });

  it("ne renvoie jamais [object Object] pour un objet simple type PostgrestError", () => {
    const postgrestError = { message: "duplicate key value", code: "23505", details: "...", hint: null };
    const result = errorMessage(postgrestError);
    expect(result).not.toContain("[object Object]");
    expect(result).toContain("duplicate key value");
    expect(result).toContain("23505");
  });

  it("inclut le status pour un objet simple type AuthError", () => {
    const authError = { message: "invalid token", status: 401 };
    const result = errorMessage(authError);
    expect(result).toContain("invalid token");
    expect(result).toContain("401");
  });

  it("retombe sur JSON.stringify pour un objet sans champ message/code/status connu", () => {
    const result = errorMessage({ foo: "bar" });
    expect(result).not.toBe("[object Object]");
    expect(result).toContain("foo");
  });

  it("gere les valeurs primitives", () => {
    expect(errorMessage("deja une chaine")).toBe("deja une chaine");
    expect(errorMessage(null)).toBe("null");
    expect(errorMessage(undefined)).toBe("undefined");
  });
});
