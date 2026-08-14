import type { KeyProvider, TelemetryEvent, TelemetrySink } from "../types";

export function fakeResponseBody(
  outputText: string,
  usage = { input_tokens: 10, output_tokens: 20 },
) {
  return {
    id: "resp_test",
    object: "response",
    status: "completed",
    output: [
      {
        type: "message",
        id: "msg_test",
        status: "completed",
        role: "assistant",
        content: [{ type: "output_text", text: outputText, annotations: [] }],
      },
    ],
    usage: {
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      total_tokens: usage.input_tokens + usage.output_tokens,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 0 },
    },
  };
}

export function fakeFetchResponses(outputText: string, usage = { input_tokens: 10, output_tokens: 20 }) {
  return async function fetchImpl(): Promise<Response> {
    return new Response(JSON.stringify(fakeResponseBody(outputText, usage)), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

export function fakeFetchError(status: number, message: string) {
  return async function fetchImpl(): Promise<Response> {
    return new Response(
      JSON.stringify({ error: { message, type: "invalid_request_error" } }),
      { status, headers: { "content-type": "application/json" } },
    );
  };
}

export class RecordingTelemetrySink implements TelemetrySink {
  events: TelemetryEvent[] = [];
  async record(event: TelemetryEvent): Promise<void> {
    this.events.push(event);
  }
}

export class StaticKeyProvider implements KeyProvider {
  constructor(private readonly key: string = "sk-test-key") {}
  async getApiKey(): Promise<string> {
    return this.key;
  }
}
