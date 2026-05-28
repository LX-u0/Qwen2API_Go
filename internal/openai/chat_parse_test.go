package openai

import "testing"

func TestParseChatCompletionContentSupportsDirectJSONMessage(t *testing.T) {
	raw := []byte(`{
		"choices": [
			{
				"index": 0,
				"message": {
					"role": "assistant",
					"content": "hello from json"
				},
				"finish_reason": "stop"
			}
		],
		"usage": {
			"prompt_tokens": 12,
			"completion_tokens": 4,
			"total_tokens": 16
		}
	}`)

	content, reasoning, prompt, completion, total := parseChatCompletionContent(raw, false)
	if content != "hello from json" {
		t.Fatalf("content = %q, want %q", content, "hello from json")
	}
	if reasoning != "" {
		t.Fatalf("reasoning = %q, want empty", reasoning)
	}
	if prompt != 12 || completion != 4 || total != 16 {
		t.Fatalf("usage = (%d,%d,%d), want (12,4,16)", prompt, completion, total)
	}
}

func TestParseChatCompletionContentSupportsSSEDelta(t *testing.T) {
	raw := []byte("data: {\"choices\":[{\"delta\":{\"phase\":\"think\",\"content\":\"first\"}}]}\n\n" +
		"data: {\"choices\":[{\"delta\":{\"phase\":\"answer\",\"content\":\"second\"}}]}\n\n")

	content, reasoning, _, _, _ := parseChatCompletionContent(raw, true)
	if content != "second" {
		t.Fatalf("content = %q, want %q", content, "second")
	}
	if reasoning != "first" {
		t.Fatalf("reasoning = %q, want %q", reasoning, "first")
	}
}

func TestParseChatCompletionContentHidesThinkingByDefault(t *testing.T) {
	raw := []byte("data: {\"choices\":[{\"delta\":{\"phase\":\"think\",\"content\":\"first\"}}]}\n\n" +
		"data: {\"choices\":[{\"delta\":{\"phase\":\"answer\",\"content\":\"second\"}}]}\n\n")

	content, reasoning, _, _, _ := parseChatCompletionContent(raw, false)
	if content != "second" {
		t.Fatalf("content = %q, want %q", content, "second")
	}
	if reasoning != "" {
		t.Fatalf("reasoning = %q, want empty", reasoning)
	}
}

func TestParseChatCompletionContentSupportsNestedJSONContent(t *testing.T) {
	raw := []byte(`{
		"data": {
			"message": {
				"content": [
					{"text": "hello from nested payload"}
				]
			}
		}
	}`)

	content, reasoning, _, _, _ := parseChatCompletionContent(raw, false)
	if content != "hello from nested payload" {
		t.Fatalf("content = %q, want %q", content, "hello from nested payload")
	}
	if reasoning != "" {
		t.Fatalf("reasoning = %q, want empty", reasoning)
	}
}

func TestParseChatCompletionContentSupportsThinkingSummaryPhase(t *testing.T) {
	raw := []byte("data: {\"choices\":[{\"delta\":{\"phase\":\"thinking_summary\",\"content\":\"\",\"extra\":{\"summary_title\":{\"content\":[\"回应用户的问候并主动提供帮助\"]},\"summary_thought\":{\"content\":[\"我感知到用户重复发送了简单的问候。\",\"我希望能为用户提供更有价值的协助。\"]}}}}]}\n\n" +
		"data: {\"choices\":[{\"delta\":{\"phase\":\"answer\",\"content\":\"你好\"}}]}\n\n")

	content, reasoning, _, _, _ := parseChatCompletionContent(raw, true)
	wantReasoning := "回应用户的问候并主动提供帮助\n我感知到用户重复发送了简单的问候。\n我希望能为用户提供更有价值的协助。"
	if content != "你好" {
		t.Fatalf("content = %q, want %q", content, "你好")
	}
	if reasoning != wantReasoning {
		t.Fatalf("reasoning = %q, want %q", reasoning, wantReasoning)
	}
}

func TestParseChatCompletionContentHidesThinkingSummaryWhenDisabled(t *testing.T) {
	raw := []byte("data: {\"choices\":[{\"delta\":{\"phase\":\"thinking_summary\",\"content\":\"\",\"extra\":{\"summary_title\":{\"content\":[\"回应用户的问候并主动提供帮助\"]},\"summary_thought\":{\"content\":[\"我感知到用户重复发送了简单的问候。\",\"我希望能为用户提供更有价值的协助。\"]}}}}]}\n\n" +
		"data: {\"choices\":[{\"delta\":{\"phase\":\"answer\",\"content\":\"你好\"}}]}\n\n")

	content, reasoning, _, _, _ := parseChatCompletionContent(raw, false)
	if content != "你好" {
		t.Fatalf("content = %q, want %q", content, "你好")
	}
	if reasoning != "" {
		t.Fatalf("reasoning = %q, want empty", reasoning)
	}
}
