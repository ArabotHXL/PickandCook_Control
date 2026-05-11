import { describe, expect, it } from "vitest";
import pg from "pg";

const { Pool } = pg;

describe("pg Pool error handler", () => {
  it("does not throw when an idle client error event is emitted with a listener attached", () => {
    const pool = new Pool({ connectionString: "postgres://x:y@127.0.0.1:1/z" });
    let captured: unknown = null;
    pool.on("error", (err) => {
      captured = err;
    });

    expect(() => pool.emit("error", new Error("administrator command"))).not.toThrow();
    expect(captured).toBeInstanceOf(Error);
    expect((captured as Error).message).toBe("administrator command");

    void pool.end().catch(() => {});
  });

  it("would throw without a listener (sanity check of the underlying behaviour)", () => {
    const pool = new Pool({ connectionString: "postgres://x:y@127.0.0.1:1/z" });
    expect(() => pool.emit("error", new Error("boom"))).toThrow();
    void pool.end().catch(() => {});
  });
});
