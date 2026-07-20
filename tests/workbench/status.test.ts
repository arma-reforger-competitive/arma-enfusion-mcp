import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server, type Socket } from "node:net";
import { WorkbenchClient, STATE_TTL_MS, type WorkbenchState } from "../../src/workbench/client.js";
import {
  formatConnectionStatus,
  deriveStatus,
  requireEditMode,
  requirePlayMode,
} from "../../src/workbench/status.js";
import { encodePascalString, decodePascalString, decodeInt32LE } from "../../src/workbench/protocol.js";

function createMockWorkbench(
  handler: (apiFunc: string, params: Record<string, unknown>) => unknown
): { server: Server; port: number; close: () => Promise<void> } {
  const server = createServer((socket: Socket) => {
    const chunks: Buffer[] = [];
    socket.on("data", (chunk) => chunks.push(chunk));
    socket.on("end", () => {
      try {
        const buf = Buffer.concat(chunks);
        let offset = 0;
        const { bytesRead: b0 } = decodeInt32LE(buf, offset);
        offset += b0;
        const { bytesRead: b1 } = decodePascalString(buf, offset);
        offset += b1;
        const { bytesRead: b2 } = decodePascalString(buf, offset);
        offset += b2;
        const { value: payload } = decodePascalString(buf, offset);
        const parsed = JSON.parse(payload);
        const { APIFunc, ...params } = parsed;
        const response = handler(APIFunc, params);
        const statusBuf = encodePascalString("Ok");
        const payloadBuf = encodePascalString(JSON.stringify(response));
        socket.end(Buffer.concat([statusBuf, payloadBuf]));
      } catch (e) {
        const errBuf = encodePascalString(`Error: ${String(e)}`);
        socket.end(errBuf);
      }
    });
  });

  let resolvedPort = 0;
  server.listen(0);
  const addr = server.address();
  if (addr && typeof addr !== "string") {
    resolvedPort = addr.port;
  }

  return {
    server,
    port: resolvedPort,
    close: () => new Promise((res) => server.close(() => res())),
  };
}

/** Build a lightweight client stub exposing a fixed cached state. */
function stubClient(state: WorkbenchState): WorkbenchClient {
  return { state } as unknown as WorkbenchClient;
}

describe("deriveStatus", () => {
  const now = 1_000_000;

  it("is disconnected when not connected", () => {
    expect(deriveStatus({ connected: false, mode: "unknown", lastUpdated: now }, now)).toBe("disconnected");
  });

  it("is connected when fresh (within TTL)", () => {
    const state: WorkbenchState = { connected: true, mode: "edit", lastUpdated: now - STATE_TTL_MS };
    expect(deriveStatus(state, now)).toBe("connected");
  });

  it("is stale when older than TTL", () => {
    const state: WorkbenchState = { connected: true, mode: "edit", lastUpdated: now - STATE_TTL_MS - 1 };
    expect(deriveStatus(state, now)).toBe("stale");
  });
});

describe("formatConnectionStatus", () => {
  const now = 1_000_000;

  it("shows disconnected", () => {
    const status = formatConnectionStatus(stubClient({ connected: false, mode: "unknown", lastUpdated: 0 }), now);
    expect(status).toContain("disconnected");
  });

  it("shows edit mode with age", () => {
    const status = formatConnectionStatus(stubClient({ connected: true, mode: "edit", lastUpdated: now - 3000 }), now);
    expect(status).toContain("edit mode (3s ago)");
  });

  it("shows play mode with age", () => {
    const status = formatConnectionStatus(stubClient({ connected: true, mode: "play", lastUpdated: now - 1000 }), now);
    expect(status).toContain("play mode (1s ago)");
  });

  it("shows connected (mode unknown) with age", () => {
    const status = formatConnectionStatus(stubClient({ connected: true, mode: "unknown", lastUpdated: now - 8000 }), now);
    expect(status).toContain("connected (mode unknown) (8s ago)");
  });

  it("shows stale with last-seen age and previous mode", () => {
    const state: WorkbenchState = { connected: true, mode: "edit", lastUpdated: now - 47_000 };
    const status = formatConnectionStatus(stubClient(state), now);
    expect(status).toContain("stale — last seen 47s ago (was edit)");
  });
});

describe("requireEditMode / requirePlayMode (async, self-refreshing)", () => {
  let mock: ReturnType<typeof createMockWorkbench>;

  afterEach(async () => {
    if (mock) await mock.close();
  });

  it("proceeds without a probe when fresh edit and edit is required", async () => {
    mock = createMockWorkbench(() => ({ mode: "edit" }));
    const client = new WorkbenchClient("127.0.0.1", mock.port);
    await client.call("EMCP_WB_Ping"); // fresh edit
    expect(await requireEditMode(client, "create entity")).toBeNull();
  });

  it("blocks with wb_stop when fresh play and edit is required", async () => {
    mock = createMockWorkbench(() => ({ mode: "play" }));
    const client = new WorkbenchClient("127.0.0.1", mock.port);
    await client.call("EMCP_WB_Ping");
    const result = await requireEditMode(client, "create entity");
    expect(result).toContain("play mode");
    expect(result).toContain("wb_stop");
  });

  it("blocks with wb_play when fresh edit and play is required", async () => {
    mock = createMockWorkbench(() => ({ mode: "edit" }));
    const client = new WorkbenchClient("127.0.0.1", mock.port);
    await client.call("EMCP_WB_Ping");
    const result = await requirePlayMode(client, "stop");
    expect(result).toContain("edit mode");
    expect(result).toContain("wb_play");
  });

  it("probes once when mode is unknown, then proceeds on fresh mode", async () => {
    mock = createMockWorkbench((apiFunc) => {
      if (apiFunc === "EMCP_WB_GetState") return { mode: "edit" };
      return { status: "ok" }; // no mode → stays unknown until GetState
    });
    const client = new WorkbenchClient("127.0.0.1", mock.port);
    await client.call("ReloadScripts"); // connected, mode unknown
    expect(client.state.mode).toBe("unknown");
    expect(await requireEditMode(client, "create entity")).toBeNull();
    expect(client.state.mode).toBe("edit"); // refreshState wrote through
  });

  it("fires exactly one refreshState probe when the cache is stale", async () => {
    let getStateCalls = 0;
    mock = createMockWorkbench((apiFunc) => {
      if (apiFunc === "EMCP_WB_GetState") getStateCalls++;
      return { mode: "edit" };
    });
    const client = new WorkbenchClient("127.0.0.1", mock.port);
    await client.call("EMCP_WB_Ping"); // fresh edit
    client.markStale(); // now stale
    getStateCalls = 0; // only count the guard's probe

    const result = await requireEditMode(client, "create entity");
    expect(result).toBeNull();
    expect(getStateCalls).toBe(1);
  });

  it("hard-blocks to wb_diagnose when the refresh fails (disconnected)", async () => {
    const client = new WorkbenchClient("127.0.0.1", 1); // nothing listening
    const result = await requireEditMode(client, "create entity");
    expect(result).toContain("wb_diagnose");
  });
});
